/* ============================================================
 * settings.js — Quản lý cấu hình người dùng (localStorage)
 * ============================================================ */

const KEY = "stormwatch-settings";
let cache = null;

export const loadSettings = () => {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    cache = {};
  }
  return cache;
};

export const saveSettings = (patch) => {
  cache = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* chế độ riêng tư */
  }
};

export const getSetting = (key, fallback) => {
  return loadSettings()[key] ?? fallback;
};
