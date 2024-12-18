import fetch from "node-fetch";
import fs from "fs";
import log from "./utils/logger_2.js";
import beddu from "./utils/banner.js";
import { headers } from "./utils/header.js";
import { settings } from "./config.js";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { fileURLToPath } from "url"; // Import necessary functions for file URL conversion
import { dirname } from "path"; // Import necessary functions for path manipulation
import { getRandomNumber, sleep, loadData } from "./utils/utils.js";
const __filename = fileURLToPath(import.meta.url); // Get the current module's filename
const __dirname = dirname(__filename);
import { HttpsProxyAgent } from "https-proxy-agent";
// The API base URL
const baseURL = settings.BASE_URL;

class Hivera {
  constructor(queryId, accountIndex, proxy) {
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIp = "Unknown IP";
    this.session_name = null;
  }

  // Create agent with proxy
  async createProxyAgent(proxyUrl) {
    if (!proxyUrl) return null;
    // const { HttpsProxyAgent } = await import("https-proxy-agent");
    return new HttpsProxyAgent(proxyUrl);
  }

  async fetchAuthData(userData, agent) {
    try {
      const response = await fetch(`${baseURL}/auth?auth_data=${encodeURIComponent(userData)}`, {
        headers: headers,
        agent: agent,
      });
      if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}] Error fetching auth data:`, error);
      return null;
    }
  }

  async fetchInfoData(userData, agent) {
    try {
      const response = await fetch(`${baseURL}/referral?referral_code=2b6a4dfc8&auth_data=${encodeURIComponent(userData)}`, {
        headers: headers,
        agent: agent,
      });
      return response;
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}] Error fetching info data:`, error);
      return null;
    }
  }

  async fetchPowerData(userData, agent) {
    try {
      const response = await fetch(`${baseURL}/engine/info?auth_data=${encodeURIComponent(userData)}`, {
        headers: headers,
        agent: agent,
      });
      if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}] Error fetching power data:`, error);
      return null;
    }
  }

  generatePayload() {
    const fromDate = Date.now();
    const values = [75, 80, 85, 90, 95, 100];
    const qualityConnection = values[Math.floor(Math.random() * values.length)];
    return {
      from_date: fromDate,
      quality_connection: qualityConnection,
    };
  }

  async contribute(userData, agent) {
    try {
      const payload = this.generatePayload();
      const response = await fetch(`${baseURL}/engine/contribute?auth_data=${encodeURIComponent(userData)}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
        agent: agent,
      });
      if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}] Error in contribute:`, error);
      return null;
    }
  }

  async completeTask(userData, agent, id) {
    let taskid = id;
    let url = `${baseURL}/missions/complete?mission_id=${taskid}&&auth_data=${encodeURIComponent(userData)}`;

    if (taskid.toString().includes("daily")) {
      taskid = taskid.replace("daily_", "");
      url = `${baseURL}/daily-tasks/complete?task_id=${taskid}&&auth_data=${encodeURIComponent(userData)}`;
    }
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: headers,
        agent: agent,
      });
      if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}] Error in Complete task:`, error);
      return null;
    }
  }

  async handleTasks(userData, agent) {
    try {
      let misssions = await this.getTask(userData, agent);
      let tasksDaily = await this.getDailyTask(userData, agent);
      let tasks = [];
      if (misssions?.result) {
        misssions = misssions.result.filter((t) => !t.complete && !settings.SKIP_TASKS.includes(t.id));
      }
      if (tasksDaily?.result) {
        tasksDaily = tasksDaily.result.map((t) => ({ ...t, id: `daily_${t.id}` })).filter((t) => !t.complete && !settings.SKIP_TASKS.includes(t.id));
      }

      tasks = [...misssions, ...tasksDaily];

      for (const task of tasks) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        log.info(`[Account ${this.accountIndex + 1}] Starting task ${task.id} | ${task.name}...`);

        const res = await this.completeTask(userData, agent, task.id);
        if (res?.result == "done") {
          log.info(`[Account ${this.accountIndex + 1}] Task ${task.id} | ${task.name} completed successfully`);
        }
      }

      return log.debug(`[Account ${this.accountIndex + 1}] Completed tasks!`);
    } catch (error) {
      return log.error(`[Account ${this.accountIndex + 1}] Failed to handle tasks: ${error.message}`);
    }
  }

  async getTask(userData, agent) {
    try {
      const response = await fetch(`${baseURL}/missions?auth_data=${encodeURIComponent(userData)}`, {
        method: "GET",
        headers: headers,
        agent: agent,
      });
      if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}] Error in contribute:`, error);
      return null;
    }
  }

  async getDailyTask(userData, agent) {
    try {
      const response = await fetch(`${baseURL}/daily-tasks?auth_data=${encodeURIComponent(userData)}`, {
        method: "GET",
        headers: headers,
        agent: agent,
      });
      if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}] Error in contribute:`, error);
      return null;
    }
  }

  async processUser(userData, proxy) {
    let username = "Unknown";
    try {
      const agent = await this.createProxyAgent(proxy);
      const info = await this.fetchInfoData(userData, agent);
      const profile = await this.fetchAuthData(userData, agent);
      username = profile?.result?.username || "Unknown";

      const powerData = await this.fetchPowerData(userData, agent);
      const hivera = powerData?.result?.profile?.HIVERA || 0;
      let power = powerData?.result?.profile?.POWER || 0;
      let powerCapacity = powerData?.result?.profile?.POWER_CAPACITY || 0;

      log.info(`[Account ${this.accountIndex + 1}] Username: ${username} | Hivera: ${hivera} | Power: ${power} | Power Capacity: ${powerCapacity} | Proxy: ${this.proxyIp}`);

      if (settings.AUTO_TASK) {
        log.info(`[Account ${this.accountIndex + 1}] Getting tasks...`);
        await this.handleTasks(userData, agent);
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
      // Start mining
      while (power > 500) {
        const contributeData = await this.contribute(userData, agent);
        if (contributeData) {
          const { HIVERA, POWER, POWER_CAPACITY } = contributeData?.result?.profile;
          log.info(`[Account ${this.accountIndex + 1}] Mining successfully for user: ${username}`);
          log.info(`[Account ${this.accountIndex + 1}] | Hivera: ${HIVERA} | Power: ${POWER} | Power Capacity: ${POWER_CAPACITY}.`);
          power = contributeData?.result?.profile?.POWER || 0;
          log.info(`[Account ${this.accountIndex + 1}] Remining after 30 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
        }
      }

      log.warn(`[Account ${this.accountIndex + 1}] User ${username} does not have enough power to mine...Skiping`);
      return;
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}] Error processing user ${username} with proxy ${this.proxyIp}: ${error.message}`);
      return;
    }
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await fetch("https://api.ipify.org?format=json", { agent: proxyAgent });

      if (response.ok) {
        // response.ok checks if the status is in the range 200-299
        const data = await response.json();
        this.proxyIp = data.ip;
        return data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }
  async runAccount() {
    try {
      this.proxyIp = await this.checkProxyIP();
    } catch (error) {
      log.info(`Cannot check proxy IP: ${error.message}`, "warning");
      return;
    }

    const initData = this.queryId;
    const userData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
    const firstName = userData.first_name || "";
    const lastName = userData.last_name || "";
    this.session_name = firstName + " " + lastName;
    const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
    log.info(`=========Tài khoản ${this.accountIndex + 1}| ${firstName + " " + lastName} | ${this.proxyIp} | Bắt đầu sau ${timesleep} giây...`);
    await sleep(timesleep);

    await this.processUser(this.queryId, this.proxy);
    return log.info(`[Account ${this.accountIndex + 1}] User ${this.session_name} processed. Restarting the loop after ${settings.TIME_SLEEP} minutes...`);
  }
}

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy } = workerData;
  const to = new Hivera(queryId, accountIndex, proxy);
  try {
    await to.runAccount();
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  } finally {
    if (!isMainThread) {
      parentPort.postMessage("taskComplete");
    }
  }
}

async function readUserFile(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const userArray = data
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line);
    if (userArray.length === 0) {
      log.warn(`No users found in the file.`);
    }
    return userArray;
  } catch (error) {
    log.error(`Error reading file:`, error.message);
    return [];
  }
}

async function readProxyFile(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const proxyArray = data
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line);
    if (proxyArray.length === 0) {
      log.warn(`No proxies found in the file.`);
    }
    return proxyArray;
  } catch (error) {
    log.error(`Error reading proxy file:`, error);
    return [];
  }
}

async function main() {
  log.info(beddu);
  const userDatas = await loadData("data.txt");
  const proxies = await loadData("proxy.txt");

  if (userDatas.length === 0) {
    log.error(`No user data found in the file.`);
    process.exit(0);
  }

  if (proxies.length === 0) {
    log.warn(`No proxies found in the file. Proceeding without proxies.`);
  }

  let maxThreads = settings.MAX_THEADS;

  while (true) {
    let currentIndex = 0;
    const errors = [];

    while (currentIndex < userDatas.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, userDatas.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            queryId: userDatas[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message === "taskComplete") {
                worker.terminate();
              }
              if (message.error) {
                // errors.push(`Tài khoản ${currentIndex + 1}: ${message.error}`);
                console.log(`Tài khoản ${message.accountIndex}: ${message.error}`);
              }
              resolve();
            });
            worker.on("error", (error) => {
              // errors.push(`Lỗi worker cho tài khoản ${currentIndex + 1}: ${error.message}`);
              console.log(`Lỗi worker cho tài khoản ${currentIndex + 1}: ${error.message}`);
              worker.terminate();
            });
            worker.on("exit", (code) => {
              worker.terminate();
              if (code !== 0) {
                // console.log(`Worker cho tài khoản ${currentIndex + 1} thoát với mã: ${code}`);
              }
              resolve();
            });
          })
        );
        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < userDatas.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    log.info(`All users processed. Restarting the loop after ${settings.TIME_SLEEP} minutes...`);
    await new Promise((resolve) => setTimeout(resolve, settings.TIME_SLEEP * 60 * 1000));
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
