/**
 * 남양주시 스마트 조직도 - Theme Manager Module
 * 시스템 설정 감지, 다크모드 토글 및 localStorage 영속화를 관리합니다.
 */

const THEME_KEY = "nyj-theme";

/**
 * 현재 활성화된 테마를 반환합니다 ('light' 또는 'dark').
 */
export function getCurrentTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return saved;

  // OS 시스템 다크모드 환경 감지
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/**
 * 테마를 적용합니다.
 * @param {string} theme 'light' | 'dark'
 */
export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);

  // 버튼 아이콘 업데이트
  const themeBtn = document.getElementById("theme-toggle-btn");
  if (themeBtn) {
    const iconSpan = themeBtn.querySelector(".theme-icon");
    const textSpan = themeBtn.querySelector(".theme-text");
    if (theme === "dark") {
      if (iconSpan) iconSpan.textContent = "☀️";
      if (textSpan) textSpan.textContent = "라이트모드";
      themeBtn.setAttribute("aria-label", "라이트모드로 전환");
    } else {
      if (iconSpan) iconSpan.textContent = "🌙";
      if (textSpan) textSpan.textContent = "다크모드";
      themeBtn.setAttribute("aria-label", "다크모드로 전환");
    }
  }
}

/**
 * 테마를 토글합니다.
 */
export function toggleTheme() {
  const current = getCurrentTheme();
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

/**
 * 테마 초기화 및 OS 변경 감지 이벤트 리스너 등록
 */
export function initTheme() {
  const initialTheme = getCurrentTheme();
  applyTheme(initialTheme);

  // OS 설정 실시간 변경 감지 (저장된 수동 설정이 없을 때 반영)
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!localStorage.getItem(THEME_KEY)) {
        applyTheme(e.matches ? "dark" : "light");
      }
    });
  }
}
