// 目标网站列表（用于匹配URL）
const TARGET_HOSTS = [
  'youtube.com',
  'bilibili.com',
  'douyin.com'
];

// 阈值：毫秒（20分钟）
const THRESHOLD_MS = 20 * 60 * 1000;

// 存储当前正在跟踪的tabId和开始时间
let currentTracking = {
  tabId: null,
  startTime: 0,
  alreadyNotified: false
};

// 检查URL是否属于目标网站
function isTargetUrl(url) {
  if (!url) return false;
  for (const host of TARGET_HOSTS) {
    if (url.includes(host)) return true;
  }
  return false;
}

// 重置跟踪
function resetTracking() {
  if (currentTracking.tabId !== null) {
    // 清除之前可能存在的alarm
    chrome.alarms.clear(`check_${currentTracking.tabId}`);
  }
  currentTracking = {
    tabId: null,
    startTime: 0,
    alreadyNotified: false
  };
}

// 开始跟踪某个tab
function startTracking(tabId, url) {
  if (!isTargetUrl(url)) {
    resetTracking();
    return;
  }
  // 如果已经是同一个tab且在跟踪中，不重置
  if (currentTracking.tabId === tabId && currentTracking.startTime !== 0) {
    return;
  }
  // 开始新的跟踪
  resetTracking();
  currentTracking.tabId = tabId;
  currentTracking.startTime = Date.now();
  currentTracking.alreadyNotified = false;

  // 创建周期性检查的alarm（每10秒检查一次，节省资源）
  chrome.alarms.create(`check_${tabId}`, { periodInMinutes: 1 / 6 }); // 10秒
}

// 停止跟踪（tab被关闭或切换）
function stopTracking() {
  resetTracking();
}

// 检查当前跟踪的时长是否超过阈值，若超过则注入提醒
function checkAndNotify() {
  if (!currentTracking.tabId || currentTracking.startTime === 0) return;
  if (currentTracking.alreadyNotified) return;

  const elapsed = Date.now() - currentTracking.startTime;
  if (elapsed >= THRESHOLD_MS) {
    currentTracking.alreadyNotified = true;
    // 注入脚本显示卡片
    injectNotification(currentTracking.tabId);
  }
}

// 注入通知卡片
function injectNotification(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: showNotificationCard
  }).catch(err => console.warn('注入失败：', err));
}

// 在页面中显示卡片（此函数会作为字符串注入）
function showNotificationCard() {
  // 避免重复注入
  if (document.getElementById('geshu-nightsaber-card')) return;

  // 创建卡片容器
  const card = document.createElement('div');
  card.id = 'geshu-nightsaber-card';
  card.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 280px;
    background: #fffef7;
    border-radius: 16px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.2);
    border: 1px solid #e0d5b5;
    padding: 16px;
    font-family: 'Segoe UI', 'Roboto', 'Microsoft YaHei', '宋体', sans-serif;
    z-index: 99999;
    backdrop-filter: blur(4px);
    transition: all 0.2s;
  `;

  // 卡片内容
  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <span style="font-size: 18px; color: #6b4c2c;">🌙 哥舒夜带刀</span>
      <button id="geshu-close-btn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #b88d5a;">✕</button>
    </div>
    <div style="font-size: 14px; color: #2d3e24; line-height: 1.5; margin-bottom: 16px;">
      你已连续观看超过20分钟。<br>
      刚才这20分钟，是你主动选择的，还是算法推荐的？
    </div>
    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button id="geshu-continue-btn" style="background: none; border: 1px solid #cbdca8; padding: 6px 12px; border-radius: 24px; cursor: pointer; color: #5a7a48;">继续看</button>
      <button id="geshu-reflect-btn" style="background: #6b4c2c; border: none; padding: 6px 12px; border-radius: 24px; cursor: pointer; color: white;">看一眼</button>
    </div>
  `;

  document.body.appendChild(card);

  // 关闭按钮
  document.getElementById('geshu-close-btn').addEventListener('click', () => {
    card.remove();
  });
  // 继续看按钮
  document.getElementById('geshu-continue-btn').addEventListener('click', () => {
    card.remove();
  });
  // 看一眼按钮：显示完整问题（示例）
  document.getElementById('geshu-reflect-btn').addEventListener('click', () => {
    alert('今日一问：今天，我被算法牵着走了吗？\n\n（完整十二问请查看《发现系列》）');
    card.remove();
  });
}

// 监听tab激活切换
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab.url) return;
    startTracking(activeInfo.tabId, tab.url);
  });
});

// 监听tab更新（URL变化、加载完成）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    startTracking(tabId, tab.url);
  }
});

// 当tab被关闭时，如果关闭的是当前跟踪的tab，则重置
chrome.tabs.onRemoved.addListener((tabId) => {
  if (currentTracking.tabId === tabId) {
    stopTracking();
  }
});

// 周期性检查（通过alarm触发）
chrome.alarms.onAlarm.addListener((alarm) => {
  const expectedPrefix = 'check_';
  if (alarm.name.startsWith(expectedPrefix)) {
    const trackedTabId = parseInt(alarm.name.substring(expectedPrefix.length));
    if (trackedTabId === currentTracking.tabId) {
      checkAndNotify();
    }
  }
});