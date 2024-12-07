import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { stringify } from "csv-stringify/sync";

interface DataRow {
  id: number;
  coin_id: string;
  block_number?: number;
  date?: string;
  one_day_trend: number;
  day_perc_diff: number;
  one_week_trend: number;
  symbol_count: number;
  name_count: number;
  coin_id_count: number;
  sentiment_score: string | null;
  social_dominance: number;
}

// Define the file paths
const inputFilePath = path.resolve(__dirname, "sample_trends.csv");
const outputFilePath = path.resolve(__dirname, "processed_trends.csv");

// Read the CSV file
function readCSV(filePath: string): Promise<DataRow[]> {
  return new Promise((resolve, reject) => {
    const rows: DataRow[] = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => {
        // Replace NaN or null values with 0
        for (const key in row) {
          if (row[key] === "NaN" || row[key] === null) {
            row[key] = 0;
          }
        }
        rows.push(row);
      })
      .on("end", () => resolve(rows))
      .on("error", (err) => reject(err));
  });
}

// Write the updated data to a CSV file
function writeCSV(filePath: string, data: DataRow[]): void {
  const output = stringify(data, { header: true });
  fs.writeFileSync(filePath, output, "utf8");
}

// Process the data to add block numbers
function processBlocks(data: DataRow[]): DataRow[] {
  // Sort data by date (ascending order)
  data.sort((a, b) => new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime());

  // Ethereum block simulation
  const startBlock = 17000000;
  const blockInterval = 10;

  // Assign block numbers
  data.forEach((row, index) => {
    row.block_number = startBlock + index * blockInterval;
    delete row.date; // Remove the date column
  });

  return data;
}

// Main function
async function main() {
  try {
    console.log("Reading CSV...");
    const data = await readCSV(inputFilePath);

    console.log("Processing data...");
    const processedData = processBlocks(data);

    console.log("Writing processed data to CSV...");
    writeCSV(outputFilePath, processedData);

    console.log("Processing complete. Output written to:", outputFilePath);
  } catch (err) {
    console.error("Error processing data:", err);
  }
}

main();
