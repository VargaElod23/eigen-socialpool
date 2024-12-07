// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

interface ITrendDataServiceManager {
    event NewTaskCreated(uint32 indexed taskIndex, Task task);

    event TaskResponded(uint32 indexed taskIndex, Task task, address operator);

    struct TrendData {
        uint256 id;
        string coin_id;
        uint256 block_number;
        uint256 social_dominance;
    }

    struct TrendRequest {
        string coin_id;
        uint256 block_number;
    }

    struct Task {
        uint256 id;
        TrendRequest request;
    }

    function latestTaskNum() external view returns (uint32);

    function allTaskHashes(uint32 taskIndex) external view returns (bytes32);

    function allTaskResponses(
        address operator,
        uint32 taskIndex
    ) external view returns (bytes memory);

    function createNewTask(
        string memory coin_id,
        uint256 block_number
    ) external returns (Task memory);

    function respondToTask(
        Task calldata task,
        uint256 social_dominance,
        uint32 referenceTaskIndex,
        bytes calldata signature
    ) external;
}
