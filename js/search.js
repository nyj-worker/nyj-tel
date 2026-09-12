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

/**
 * 남양주시 전체 조직도 통합 검색 (시장·부시장·지휘부, 실·국장, 시의회, 8대 권역, 107개 부서, 496개 팀 전체)
 * @param {Object} data { departments, leadership, sections, leadershipStaffMap }
 * @param {string} query 검색어 (일반 단어 또는 초성)
 * @returns {Array} 가중치 정렬된 통합 검색 결과
 */
export function searchAllOrganization(data, query) {
  if (!query || !query.trim()) return [];

  const rawQuery = query.trim();
  const lowerQuery = rawQuery.toLowerCase();
  const chosungQuery = rawQuery.replace(/\s+/g, "");
  const searchIsChosung = isOnlyChosung(chosungQuery);

  const results = [];
  const matchedStaffSet = new Set();

  const { departments = [], leadership = null, sections = null, leadershipStaffMap = {} } = data || {};

  // 1. 시장·부시장·지휘부 및 보좌진 검색
  for (const [staffKey, staff] of Object.entries(leadershipStaffMap)) {
    let score = 0;
    const matches = [];

    const name = staff.name || staffKey;
    const nameChosung = getChosung(name);
    const pos = staff.position || "";
    const posChosung = getChosung(pos);
    const dept = staff.dept || "";
    const role = staff.role || "";

    if (name.toLowerCase().includes(lowerQuery) || lowerQuery.includes(name.toLowerCase())) {
      score += 160;
      matches.push({ type: "성명", text: name });
    } else if (searchIsChosung && nameChosung.includes(chosungQuery)) {
      score += 140;
      matches.push({ type: "성명(초성)", text: name });
    }

    if (pos.toLowerCase().includes(lowerQuery) || lowerQuery.includes(pos.toLowerCase())) {
      score += 130;
      matches.push({ type: "직위", text: pos });
    } else if (searchIsChosung && posChosung.includes(chosungQuery)) {
      score += 110;
      matches.push({ type: "직위(초성)", text: pos });
    }

    if (dept.toLowerCase().includes(lowerQuery)) {
      score += 80;
      matches.push({ type: "소속", text: dept });
    }

    if (role.toLowerCase().includes(lowerQuery)) {
      score += 60;
      matches.push({ type: "담당업무", text: role });
    }

    if (staff.phone && staff.phone.includes(rawQuery)) {
      score += 95;
      matches.push({ type: "전화번호", text: staff.phone });
    }
    if (staff.mobile && staff.mobile.includes(rawQuery)) {
      score += 95;
      matches.push({ type: "휴대전화", text: staff.mobile });
    }

    if (score > 0) {
      matchedStaffSet.add(staff.name);
      results.push({
        type: "staff",
        categoryType: (pos.includes("시장") || pos.includes("부시장")) ? "👑 시장·지휘부" : "👔 주요 간부 및 보좌진",
        staff: staff,
        title: `${pos} ${name}`,
        subtitle: `${dept} | ☎ ${staff.phone || ""}`,
        score: score,
        matches: matches
      });
    }
  }

  // 2. 실·국장/단장 및 사업소장 검색 (headquarters & directAgencies 카테고리 헤더)
  const scanCategories = [
    ...(sections?.headquarters?.categories || []),
    ...(sections?.directAgencies?.categories || [])
  ];

  for (const cat of scanCategories) {
    if (!cat.headName || matchedStaffSet.has(cat.headName)) continue;

    let score = 0;
    const matches = [];
    const headName = cat.headName;
    const headChosung = getChosung(headName);
    const catName = cat.name || "";
    const catChosung = getChosung(catName);
    const rank = cat.headRank || "국장/부서장";
    const headTitle = catName.includes("기획조정실") ? "실장" : (catName.includes("추진단") ? "단장" : "국장");

    if (headName.toLowerCase().includes(lowerQuery) || lowerQuery.includes(headName.toLowerCase())) {
      score += 150;
      matches.push({ type: "성명", text: headName });
    } else if (searchIsChosung && headChosung.includes(chosungQuery)) {
      score += 130;
      matches.push({ type: "성명(초성)", text: headName });
    }

    if (catName.toLowerCase().includes(lowerQuery) || lowerQuery.includes(catName.toLowerCase())) {
      score += 90;
      matches.push({ type: "소속 실·국", text: catName });
    }

    if (score > 0) {
      matchedStaffSet.add(headName);
      results.push({
        type: "staff",
        categoryType: "👔 실·국장 및 사업소장",
        staff: {
          name: headName,
          position: `${catName} ${headTitle}`,
          positionDetail: `${rank}`,
          dept: catName,
          breadcrumb: `남양주시청 > ${catName}`,
          phone: "031-590-2114 (대표)",
          role: `${catName} 소관 업무 총괄 지휘 및 주요 정책 조정`,
          avatar: headName.charAt(0),
          avatarBg: "linear-gradient(135deg, #1e40af, #1e3a8a)"
        },
        title: `${catName} ${headTitle} ${headName}`,
        subtitle: `${rank} | ${catName} 총괄`,
        score: score,
        matches: matches
      });
    }
  }

  // 3. 시의회 사무국 검색 (council)
  if (sections?.council) {
    const council = sections.council;
    // 전문위원 검색
    if (council.specialists && Array.isArray(council.specialists)) {
      for (const sp of council.specialists) {
        let score = 0;
        const matches = [];
        const name = sp.name || "";
        const title = sp.title || "";

        if (name.toLowerCase().includes(lowerQuery)) {
          score += 135;
          matches.push({ type: "전문위원", text: name });
        } else if (searchIsChosung && getChosung(name).includes(chosungQuery)) {
          score += 115;
          matches.push({ type: "전문위원(초성)", text: name });
        }

        if (title.toLowerCase().includes(lowerQuery) || lowerQuery.includes("전문위원") || lowerQuery.includes("의회")) {
          score += 85;
          matches.push({ type: "직위", text: title });
        }

        if (sp.phone && sp.phone.includes(rawQuery)) {
          score += 95;
          matches.push({ type: "내선", text: sp.phone });
        }

        if (score > 0) {
          results.push({
            type: "council",
            categoryType: "⚖️ 시의회 사무국",
            councilItem: sp,
            title: `${title} ${name}`,
            subtitle: `남양주시의회 사무국 | ☎ 031-590-${sp.phone}`,
            score: score,
            matches: matches
          });
        }
      }
    }

    // 시의회 팀 검색
    if (council.teams && Array.isArray(council.teams)) {
      for (const tm of council.teams) {
        let score = 0;
        const matches = [];
        const teamName = tm.name || "";
        const leader = tm.leader || "";

        if (teamName.toLowerCase().includes(lowerQuery) || (lowerQuery.includes("시의회") && teamName.includes("팀"))) {
          score += 90;
          matches.push({ type: "의회 팀", text: teamName });
        }
        if (leader.toLowerCase().includes(lowerQuery)) {
          score += 80;
          matches.push({ type: "팀장", text: leader });
        }
        if (score > 0) {
          results.push({
            type: "council",
            categoryType: "⚖️ 시의회 사무국",
            councilItem: tm,
            title: `시의회사무국 ${teamName}`,
            subtitle: `팀장: ${leader || "배치"} | ☎ 031-590-${tm.extension || ""}`,
            score: score,
            matches: matches
          });
        }
      }
    }
  }

  // 4. 8대 권역 행정복지센터 검색 (welfareCenters)
  if (sections?.welfareCenters?.zones && Array.isArray(sections.welfareCenters.zones)) {
    for (const zone of sections.welfareCenters.zones) {
      let score = 0;
      const matches = [];
      const zName = zone.zoneName || "";
      const centerName = zone.center?.name || "";
      const subName = zone.subArea?.name || "";

      if (zName.toLowerCase().includes(lowerQuery)) {
        score += 95;
        matches.push({ type: "권역", text: zName });
      }
      if (centerName.toLowerCase().includes(lowerQuery)) {
        score += 90;
        matches.push({ type: "거점 읍·동", text: centerName });
      }
      if (subName.toLowerCase().includes(lowerQuery)) {
        score += 85;
        matches.push({ type: "관할 지역", text: subName });
      }

      if (score > 0) {
        results.push({
          type: "zone",
          categoryType: "🏡 행정복지센터 (8대 권역)",
          zone: zone,
          title: `📍 ${zName} (${centerName})`,
          subtitle: `거점: ${centerName} | 관할: ${subName}`,
          score: score,
          matches: matches
        });
      }
    }
  }

  // 5. 일반 107개 부서 및 소속 496개 팀 검색 (기존 searchDepartments 결과 통합)
  const deptResults = searchDepartments(departments, query);
  for (const dr of deptResults) {
    results.push({
      type: "department",
      categoryType: "🏛️ 본청 및 사업소 부서",
      department: dr.department,
      score: dr.score,
      matches: dr.matches
    });
  }

  // 가중치 내림차순 정렬
  results.sort((a, b) => b.score - a.score);
  return results;
}
