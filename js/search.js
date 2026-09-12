/**
 * 남양주시 스마트 조직도 - Search Engine Module
 * 한글 초성 검색, 다중 필드 가중치 검색 및 하이라이팅을 지원합니다.
 */

const CHOSUNG_LIST = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
];

/**
 * 한글 문자열에서 초성을 추출합니다.
 * @param {string} str 입력 문자열 (예: "자동차관리과")
 * @returns {string} 초성 문자열 (예: "ㅈㄷㅊㄱㄹㄱ")
 */
export function getChosung(str) {
  if (!str) return "";
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 0xac00;
    if (code >= 0 && code <= 11171) {
      const chosungIndex = Math.floor(code / (21 * 28));
      result += CHOSUNG_LIST[chosungIndex];
    } else {
      result += str.charAt(i);
    }
  }
  return result;
}

/**
 * 검색어가 순수 초성으로만 이루어져 있는지 판별합니다.
 * @param {string} query
 */
export function isOnlyChosung(query) {
  if (!query) return false;
  return /^[ㄱ-ㅎ]+$/.test(query.replace(/\s+/g, ""));
}

/**
 * 디바운스 함수 (입력 빈도 최적화)
 */
export function debounce(func, wait = 200) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * 대상 텍스트에서 일치하는 검색어를 <mark> 태그로 감쌉니다.
 */
export function highlightText(text, query) {
  if (!text || !query) return text || "";
  const q = query.trim();
  if (!q) return text;

  // 일반 텍스트 매칭 하이라이트
  const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return text.replace(regex, "<mark class='highlight'>$1</mark>");
}

/**
 * 통합 검색을 실행합니다.
 * @param {Array} departments 전체 부서 목록
 * @param {string} query 검색어 (초성 또는 일반 키워드)
 * @returns {Array} 가중치 정렬된 검색 결과 목록
 */
export function searchDepartments(departments, query) {
  if (!query || !query.trim()) return [];

  const rawQuery = query.trim();
  const lowerQuery = rawQuery.toLowerCase();
  const chosungQuery = rawQuery.replace(/\s+/g, "");
  const searchIsChosung = isOnlyChosung(chosungQuery);

  const results = [];

  for (const dept of departments) {
    let score = 0;
    const matches = [];

    // 1. 부서명 검사 (가중치: 100)
    const deptName = dept.name || "";
    const deptChosung = getChosung(deptName);

    if (deptName.toLowerCase().includes(lowerQuery)) {
      score += 100;
      matches.push({ type: "부서명", text: deptName });
    } else if (searchIsChosung && deptChosung.includes(chosungQuery)) {
      score += 90;
      matches.push({ type: "부서명(초성)", text: deptName });
    }

    // 2. 부서장 이름/직위 검사 (가중치: 80)
    if (dept.head && dept.head.name) {
      const headName = dept.head.name;
      const headChosung = getChosung(headName);
      if (headName.toLowerCase().includes(lowerQuery)) {
        score += 80;
        matches.push({ type: "부서장", text: `${headName} (${dept.head.position || "과장"})` });
      } else if (searchIsChosung && headChosung.includes(chosungQuery)) {
        score += 70;
        matches.push({ type: "부서장(초성)", text: `${headName} (${dept.head.position || "과장"})` });
      }

      // 내선번호/전화번호 검색
      if (dept.head.extension && dept.head.extension.includes(rawQuery)) {
        score += 95;
        matches.push({ type: "부서장 내선", text: dept.head.extension });
      }
    }

    // 3. 소속 팀 및 팀장 검사 (가중치: 팀명 90, 팀장 80)
    if (dept.teams && Array.isArray(dept.teams)) {
      for (const team of dept.teams) {
        const teamName = team.name || "";
        const teamFullName = team.fullName || `${teamName}팀`;
        const teamChosung = getChosung(teamName);
        const leaderName = team.leader || "";
        const leaderChosung = getChosung(leaderName);

        // 팀명 매칭
        if (teamFullName.toLowerCase().includes(lowerQuery) || teamName.toLowerCase().includes(lowerQuery)) {
          score += 90;
          matches.push({ type: "팀", text: teamFullName });
        } else if (searchIsChosung && teamChosung.includes(chosungQuery)) {
          score += 80;
          matches.push({ type: "팀(초성)", text: teamFullName });
        }

        // 팀장 성명 매칭
        if (leaderName && leaderName.toLowerCase().includes(lowerQuery)) {
          score += 80;
          matches.push({ type: "팀장", text: `${teamFullName} - ${leaderName} 팀장` });
        } else if (leaderName && searchIsChosung && leaderChosung.includes(chosungQuery)) {
          score += 70;
          matches.push({ type: "팀장(초성)", text: `${teamFullName} - ${leaderName} 팀장` });
        }

        // 팀 내선번호 매칭
        if (team.extension && team.extension.includes(rawQuery)) {
          score += 85;
          matches.push({ type: "팀 내선", text: `${teamFullName} (내선 ${team.extension})` });
        }
      }
    }

    // 4. 주요 업무 요약 검사 (가중치: 50)
    if (dept.summary && Array.isArray(dept.summary)) {
      for (const task of dept.summary) {
        if (task.toLowerCase().includes(lowerQuery)) {
          score += 50;
          matches.push({ type: "주요업무", text: task });
          break; // 하나만 매칭되어도 충분
        }
      }
    }

    // 결과에 부합할 경우 추가
    if (score > 0) {
      results.push({
        department: dept,
        score: score,
        matches: matches
      });
    }
  }

  // 가중치 내림차순 정렬
  results.sort((a, b) => b.score - a.score);
  return results;
}
