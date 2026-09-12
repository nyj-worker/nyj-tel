/**
 * 남양주시 스마트 조직도 - Favorites & Recent Views Module
 * localStorage 기반 즐겨찾기 및 최근 본 부서 관리, 토스트 알림을 지원합니다.
 */

const FAVORITES_KEY = "nyj-org-favorites";
const RECENT_KEY = "nyj-org-recent";
const MAX_RECENT = 10;

/**
 * 저장된 즐겨찾기 부서 ID 목록을 반환합니다.
 */
export function getFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("즐겨찾기 로드 실패:", e);
    return [];
  }
}

/**
 * 특정 부서가 즐겨찾기에 등록되어 있는지 확인합니다.
 */
export function isFavorite(deptId) {
  const list = getFavorites();
  return list.includes(deptId);
}

/**
 * 특정 부서의 즐겨찾기 상태를 토글합니다.
 * @param {string} deptId
 * @param {string} deptName 토스트 메시지용 부서명
 * @returns {boolean} 토글 후 즐겨찾기 여부 (true/false)
 */
export function toggleFavorite(deptId, deptName = "") {
  let list = getFavorites();
  let added = false;

  if (list.includes(deptId)) {
    list = list.filter((id) => id !== deptId);
    showToast(`${deptName || "해당 부서"}를 즐겨찾기에서 삭제했습니다.`);
  } else {
    list.unshift(deptId);
    added = true;
    showToast(`${deptName || "해당 부서"}를 즐겨찾기에 추가했습니다. ⭐`);
  }

  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("즐겨찾기 저장 실패:", e);
  }

  return added;
}

/**
 * 최근 조회한 부서 목록을 반환합니다.
 */
export function getRecentDepartments() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("최근 본 부서 로드 실패:", e);
    return [];
  }
}

/**
 * 최근 본 부서에 추가합니다 (중복 제거 및 최대 10개 유지).
 */
export function addRecentDepartment(deptId) {
  if (!deptId) return;
  let list = getRecentDepartments();

  // 기존 항목 제거 후 맨 앞에 추가
  list = list.filter((id) => id !== deptId);
  list.unshift(deptId);

  if (list.length > MAX_RECENT) {
    list = list.slice(0, MAX_RECENT);
  }

  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("최근 본 부서 저장 실패:", e);
  }
}

/**
 * 사용자 피드백을 위한 토스트 메시지를 표시합니다.
 */
export function showToast(message, duration = 2500) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "toast-item";
  toast.textContent = message;

  container.appendChild(toast);

  // 애니메이션 시작
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  // 제거 타이머
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}
