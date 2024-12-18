import fetch from "node-fetch";
import fs from "fs/promises";
import log from "./utils/logger_2.js";
import beddu from "./utils/banner.js";
import { headers } from "./utils/header.js";
import { settings } from "./config.js";
// The API base URL
const baseURL = settings.BASE_URL;

async function readUserFile(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const userArray = data
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line);
    if (userArray.length === 0) {
      log.warn("No users found in the file.");
    }
    return userArray;
  } catch (error) {
    log.error("Error reading file:", error);
    return [];
  }
}

async function fetchAuthData(userData) {
  try {
    const response = await fetch(`${baseURL}/auth?auth_data=${encodeURIComponent(userData)}`, {
      headers: headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    log.error("Error fetching auth data:", error);
    return null;
  }
}

async function fetchInfoData(userData) {
  try {
    const response = await fetch(`${baseURL}/referral?referral_code=2b6a4dfc8&auth_data=${encodeURIComponent(userData)}`, {
      headers: headers,
    });
    return response;
  } catch (error) {
    log.error("Error fetching info data:", error);
    return null;
  }
}

async function fetchPowerData(userData) {
  try {
    const response = await fetch(`${baseURL}/engine/info?auth_data=${encodeURIComponent(userData)}`, {
      headers: headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    log.error("Error fetching power data:", error);
    return null;
  }
}

function generatePayload() {
  const fromDate = Date.now();
  const values = [75, 80, 85, 90, 95, 100];
  const qualityConnection = values[Math.floor(Math.random() * values.length)];
  return {
    from_date: fromDate,
    quality_connection: qualityConnection,
  };
}

async function contribute(userData) {
  try {
    const payload = generatePayload();
    const response = await fetch(`${baseURL}/engine/contribute?auth_data=${encodeURIComponent(userData)}`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    log.error("Error in contribute:", error);
    return null;
  }
}

async function completeTask(userData, id) {
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
    });
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    log.error("Error in Complete task:", error);
    return null;
  }
}

async function handleTasks(userData) {
  try {
    let misssions = await getTask(userData);
    let tasksDaily = await getDailyTask(userData);
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
      log.info(`Starting task ${task.id} | ${task.name}...`);

      const res = await completeTask(userData, task.id);
      if (res?.result == "done") {
        log.info(`Task ${task.id} | ${task.name} completed successfully`);
      }
    }

    return log.debug(`Completed tasks!`);
  } catch (error) {
    return log.error(`Failed to handle tasks: ${error.message}`);
  }
}

async function getTask(userData) {
  try {
    const response = await fetch(`${baseURL}/missions?auth_data=${encodeURIComponent(userData)}`, {
      method: "GET",
      headers: headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    log.error("Error in contribute:", error);
    return null;
  }
}

async function getDailyTask(userData) {
  try {
    const response = await fetch(`${baseURL}/daily-tasks?auth_data=${encodeURIComponent(userData)}`, {
      method: "GET",
      headers: headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    log.error("Error in contribute:", error);
    return null;
  }
}

async function processUser(userData) {
  let username = "Unknown";
  try {
    const info = await fetchInfoData(userData);
    const profile = await fetchAuthData(userData);
    username = profile?.result?.username || "Unknown";

    const powerData = await fetchPowerData(userData);
    const hivera = powerData?.result?.profile?.HIVERA || 0;
    let power = powerData?.result?.profile?.POWER || 0;
    let powerCapacity = powerData?.result?.profile?.POWER_CAPACITY || 0;

    log.info(`Username: ${username} | Hivera: ${hivera} | Power: ${power} | Power Capacity: ${powerCapacity}`);

    if (settings.AUTO_TASK) {
      log.info(`Getting tasks...`);
      await handleTasks(userData);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
    // Start mining
    while (power > 500) {
      const contributeData = await contribute(userData);
      if (contributeData) {
        log.info(`Mining successfully for user: ${username}`);
        log.info(contributeData?.result?.profile);
        power = contributeData?.result?.profile?.POWER || 0;
        log.info(`Remining after 30 seconds...`);
        await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
      }
    }

    log.warn(`User ${username} does not have enough power to mine...Skipping`);
    return;
  } catch (error) {
    log.error(`Error processing user ${username}:`, error.message);
    return;
  }
}

async function main() {
  log.info(beddu);
  const userDatas = await readUserFile("data.txt");

  if (userDatas.length === 0) {
    log.error("No user data found in the file.");
    process.exit(0);
  }

  while (true) {
    log.info("Starting processing for all users...");
    await Promise.all(
      userDatas.map(async (userData, index) => {
        await processUser(userData);
      })
    );

    log.info(`All users processed. Restarting the loop after ${settings.TIME_SLEEP} minutes...`);
    await new Promise((resolve) => setTimeout(resolve, settings.TIME_SLEEP * 60 * 1000));
  }
}

// Run
main().catch((error) => {
  log.error("An unexpected error occurred:", error);
});
