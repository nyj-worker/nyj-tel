/**
 * 남양주시 스마트 조직도 - Hash Router Module
 * URL 해시 기반 딥링크 탐색 및 상태 동기화를 지원합니다.
 */

let routeHandlers = {};

/**
 * 라우터를 초기화하고 hashchange 이벤트를 감지합니다.
 * @param {Object} handlers { onDepartment, onSearch, onFavorites, onRecent, onSection, onHome }
 */
export function initRouter(handlers) {
  routeHandlers = handlers;

  window.addEventListener("hashchange", handleRouting);
  // 최초 페이지 로드 시 처리
  handleRouting();
}

/**
 * 현재 URL 해시를 분석하여 적절한 핸들러를 호출합니다.
 */
function handleRouting() {
  const hash = window.location.hash || "#/";

  if (hash.startsWith("#/department/")) {
    const deptId = hash.replace("#/department/", "").trim();
    if (routeHandlers.onDepartment) {
      routeHandlers.onDepartment(deptId);
    }
  } else if (hash.startsWith("#/search/")) {
    const query = decodeURIComponent(hash.replace("#/search/", "").trim());
    if (routeHandlers.onSearch) {
      routeHandlers.onSearch(query);
    }
  } else if (hash === "#/favorites") {
    if (routeHandlers.onFavorites) {
      routeHandlers.onFavorites();
    }
  } else if (hash === "#/recent") {
    if (routeHandlers.onRecent) {
      routeHandlers.onRecent();
    }
  } else if (hash.startsWith("#/section/")) {
    const secId = hash.replace("#/section/", "").trim();
    if (routeHandlers.onSection) {
      routeHandlers.onSection(secId);
    }
  } else {
    if (routeHandlers.onHome) {
      routeHandlers.onHome();
    }
  }
}

/**
 * 특정 경로로 해시를 변경합니다.
 */
export function navigateTo(hashPath) {
  window.location.hash = hashPath;
}
