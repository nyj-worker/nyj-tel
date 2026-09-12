/**
 * 남양주시 스마트 조직도 - Data Service Module
 * 조직 정보 JSON, 업무 요약, 수동 보정 데이터를 통합 관리합니다.
 */

let orgData = null;
let tasksData = {};
let overridesData = {};
let departmentMap = new Map();

/**
 * 조직도 전체 데이터를 비동기로 불러와 초기화합니다.
 */
export async function loadOrganization() {
  if (orgData) return orgData;

  try {
    const t = Date.now();
    const [orgRes, tasksRes, overridesRes] = await Promise.all([
      fetch(`./data/organization.json?t=${t}`).then((r) => r.json()),
      fetch(`./data/department-tasks.json?t=${t}`)
        .then((r) => r.json())
        .catch(() => ({})),
      fetch(`./data/manual-overrides.json?t=${t}`)
        .then((r) => r.json())
        .catch(() => ({}))
    ]);

    orgData = orgRes;
    tasksData = tasksRes;
    overridesData = overridesRes;

    // 부서 ID별 빠른 조회를 위한 Map 구축 및 데이터 병합
    if (orgData.departments && Array.isArray(orgData.departments)) {
      for (const dept of orgData.departments) {
        // 주요 업무 병합 (우선순위: manual-overrides > department-tasks > 기본 미등록)
        const override = overridesData[dept.id];
        if (override && override.summary) {
          dept.summary = override.summary;
        } else if (tasksData[dept.id]) {
          dept.summary = tasksData[dept.id];
        } else {
          dept.summary = ["주요 업무 정보가 등록되지 않았습니다."];
        }

        if (override && override.notice) {
          dept.notice = override.notice;
        }

        departmentMap.set(dept.id, dept);
      }
    }

    return orgData;
  } catch (error) {
    console.error("조직도 데이터 로드 중 오류가 발생했습니다:", error);
    throw error;
  }
}

/**
 * 부서 ID로 특정 부서 상세 정보를 조회합니다.
 * @param {string} id 부서 ID
 */
export function getDepartmentById(id) {
  return departmentMap.get(id) || null;
}

/**
 * 모든 부서 목록을 반환합니다.
 */
export function getAllDepartments() {
  return orgData ? orgData.departments : [];
}

/**
 * 최상위 조직 및 시장/부시장/지휘부 정보를 반환합니다.
 */
export function getLeadership() {
  return orgData ? orgData.organization : null;
}

/**
 * 3대 대분류 섹션(본청과 제2청사, 직속기관 및 사업소, 행정복지센터, 시의회) 정보를 반환합니다.
 */
export function getSections() {
  return orgData ? orgData.sections : null;
}
