import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { readTrendData } from "./createNewTasks";
const fs = require("fs");
const path = require("path");
dotenv.config();

// Check if the process.env object is empty
if (!Object.keys(process.env).length) {
  throw new Error("process.env object is empty");
}

// Setup env variables
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
/// TODO: Hack
let chainId = 31337;

const avsDeploymentData = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, `../contracts/deployments/trend-data/${chainId}.json`),
    "utf8"
  )
);
// Load core deployment data
const coreDeploymentData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, `../contracts/deployments/core/${chainId}.json`), "utf8")
);

const delegationManagerAddress = coreDeploymentData.addresses.delegation; // todo: reminder to fix the naming of this contract in the deployment file, change to delegationManager
const avsDirectoryAddress = coreDeploymentData.addresses.avsDirectory;
const trendDataServiceManagerAddress = avsDeploymentData.addresses.trendDataServiceManager;
const ecdsaStakeRegistryAddress = avsDeploymentData.addresses.stakeRegistry;

// Load ABIs
const delegationManagerABI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../abis/IDelegationManager.json"), "utf8")
);
const ecdsaRegistryABI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../abis/ECDSAStakeRegistry.json"), "utf8")
);
const trendDataServiceManagerABI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../abis/TrendDataServiceManager.json"), "utf8")
);
const avsDirectoryABI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../abis/IAVSDirectory.json"), "utf8")
);

// Initialize contract objects from ABIs
const delegationManager = new ethers.Contract(
  delegationManagerAddress,
  delegationManagerABI,
  wallet
);
const trendDataServiceManager = new ethers.Contract(
  trendDataServiceManagerAddress,
  trendDataServiceManagerABI,
  wallet
);
const ecdsaRegistryContract = new ethers.Contract(
  ecdsaStakeRegistryAddress,
  ecdsaRegistryABI,
  wallet
);
const avsDirectory = new ethers.Contract(avsDirectoryAddress, avsDirectoryABI, wallet);

const signAndRespondToTask = async (
  taskId: number,
  taskIndex: number,
  coinId: string,
  blockNumber: number
) => {
  console.log(`Signing task with ID: ${taskId}`);
  const messageHash = ethers.solidityPackedKeccak256(["string", "uint256"], [coinId, blockNumber]);
  const messageBytes = ethers.getBytes(messageHash);
  const signature = await wallet.signMessage(messageBytes);

  console.log(`Signing and responding to task ${taskIndex}`);

  const operators = [await wallet.getAddress()];
  const signatures = [signature];
  const signedTask = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "bytes[]", "uint32"],
    [operators, signatures, ethers.toBigInt((await provider.getBlockNumber()) - 1)]
  );

  const socialData = await readTrendData();

  const socialDominance = socialData[coinId][blockNumber].social_dominance;

  if (socialDominance === 0) {
    console.log(`No social dominance data found for ${coinId} at block ${blockNumber}`);
    return;
  }

  const tx = await trendDataServiceManager.respondToTask(
    { id: taskId, request: { coin_id: coinId, block_number: blockNumber } },
    socialDominance,
    taskIndex,
    signedTask
  );
  await tx.wait();
  console.log(`Responded to task.`);
};

const registerOperator = async () => {
  // Registers as an Operator in EigenLayer.
  try {
    const tx1 = await delegationManager.registerAsOperator(
      {
        __deprecated_earningsReceiver: await wallet.address,
        delegationApprover: "0x0000000000000000000000000000000000000000",
        stakerOptOutWindowBlocks: 0,
      },
      ""
    );
    await tx1.wait();
    console.log("Operator registered to Core EigenLayer contracts");
  } catch (error) {
    console.error("Error in registering as operator:", error);
  }

  const salt = ethers.hexlify(ethers.randomBytes(32));
  const expiry = Math.floor(Date.now() / 1000) + 3600; // Example expiry, 1 hour from now

  // Define the output structure
  let operatorSignatureWithSaltAndExpiry = {
    signature: "",
    salt: salt,
    expiry: expiry,
  };

  // Calculate the digest hash, which is a unique value representing the operator, avs, unique value (salt) and expiration date.
  const operatorDigestHash = await avsDirectory.calculateOperatorAVSRegistrationDigestHash(
    wallet.address,
    await trendDataServiceManager.getAddress(),
    salt,
    expiry
  );
  console.log(operatorDigestHash);

  // Sign the digest hash with the operator's private key
  console.log("Signing digest hash with operator's private key");
  const operatorSigningKey = new ethers.SigningKey(process.env.PRIVATE_KEY!);
  const operatorSignedDigestHash = operatorSigningKey.sign(operatorDigestHash);

  // Encode the signature in the required format
  operatorSignatureWithSaltAndExpiry.signature =
    ethers.Signature.from(operatorSignedDigestHash).serialized;

  console.log("Registering Operator to AVS Registry contract");

  // Register Operator to AVS
  // Per release here: https://github.com/Layr-Labs/eigenlayer-middleware/blob/v0.2.1-mainnet-rewards/src/unaudited/ECDSAStakeRegistry.sol#L49
  const tx2 = await ecdsaRegistryContract.registerOperatorWithSignature(
    operatorSignatureWithSaltAndExpiry,
    wallet.address
  );
  await tx2.wait();
  console.log("Operator registered on AVS successfully");
};

const monitorNewTasks = async () => {
  trendDataServiceManager.on("NewTaskCreated", async (logIndex, log) => {
    // Decode the event data
    console.log(`logIndex: ${logIndex}`);
    console.log(log);
    console.log();

    const taskId = log[0];
    const coinId = log[1][0];
    const blockNumber = log[1][1];

    console.log(`Task ID: ${taskId}, Coin ID: ${coinId}, Block Number: ${blockNumber}`);

    await signAndRespondToTask(taskId, logIndex, coinId, blockNumber);
  });

  console.log("Monitoring for new tasks...");
};

const main = async () => {
  await registerOperator();
  monitorNewTasks().catch((error) => {
    console.error("Error monitoring tasks:", error);
  });
};

main().catch((error) => {
  console.error("Error in main function:", error);
});
