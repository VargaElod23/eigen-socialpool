import { ethers, toBigInt } from "ethers";
import * as dotenv from "dotenv";

import csv from "csv-parser";

const fs = require("fs");
const path = require("path");
dotenv.config();

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
const trendDataServiceManagerAddress = avsDeploymentData.addresses.trendDataServiceManager;
const trendDataServiceManagerABI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../abis/TrendDataServiceManager.json"), "utf8")
);
// Initialize contract objects from ABIs
const trendDataServiceManager = new ethers.Contract(
  trendDataServiceManagerAddress,
  trendDataServiceManagerABI,
  wallet
);

interface TrendData {
  id: number;
  coin_id: string;
  block_number: number;
  social_dominance: number;
}

type CoinTrends = Record<string, Record<number, TrendData>>;

const filePath = "operator/processed_trends.csv";

export const readTrendData = (): Promise<CoinTrends> => {
  const coinTrends: CoinTrends = {};

  return new Promise<CoinTrends>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row: any) => {
        const trendData: TrendData = {
          id: Number(row.id),
          coin_id: String(row.coin_id),
          block_number: Number(row.block_number),
          social_dominance: Math.floor(row.social_dominance * Math.pow(10, 18)),
        };

        console.log("~social_dominance", trendData.social_dominance);

        if (!coinTrends[trendData.coin_id]) {
          coinTrends[trendData.coin_id] = [];
        }
        if (trendData.social_dominance !== 0 && trendData.block_number !== 0) {
          coinTrends[trendData.coin_id][trendData.block_number] = trendData;
        }
      })
      .on("end", () => {
        console.log("CSV file successfully processed");
        resolve(coinTrends);
      })
      .on("error", (error: any) => {
        reject(error);
      });
  });
};

async function createNewTask(data: TrendData) {
  try {
    const tx = await trendDataServiceManager.createNewTask(data.coin_id, data.block_number);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();

    console.log(`Transaction successful with hash: ${receipt.hash}`);
  } catch (error) {
    console.error("Error sending transaction:", error);
  }
}

// Function to create a new task with a random name every 15 seconds
async function startCreatingTasks() {
  const coinTrends = await readTrendData();
  const trendDataArray: TrendData[] = [];

  // Collect all trend data into a single array
  for (const coinId in coinTrends) {
    trendDataArray.push(...Object.values(coinTrends[coinId]));
  }

  console.log(`Trend data length: ${trendDataArray.length}`);

  let index = 0;

  // Use a single interval to iterate over the trend data
  const intervalId = setInterval(() => {
    if (index < trendDataArray.length) {
      const trendData = trendDataArray[index];
      createNewTask(trendData);
      index++;
    } else {
      console.log("All tasks have been created.");
      clearInterval(intervalId);
    }
  }, 5000); // 4000 milliseconds = 4 seconds
}

function main() {
  startCreatingTasks();
}

main();
