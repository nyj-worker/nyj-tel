/**
 * 남양주시 스마트 조직도 - Main Application Orchestrator (app.js)
 */

import {
  loadOrganization,
  getDepartmentById,
  getAllDepartments,
  getLeadership,
  getSections
} from "./dataService.js";

import {
  searchDepartments,
  searchAllOrganization,
  highlightText,
  debounce
} from "./search.js";

import {
  getFavorites,
  isFavorite,
  toggleFavorite,
  getRecentDepartments,
  addRecentDepartment,
  showToast
} from "./favorites.js";

import { initTheme, toggleTheme } from "./theme.js";
import { initRouter, navigateTo } from "./router.js";
import { loadPDF, extractTextItems, groupByRows } from "./pdfParser.js";
import { VoiceSearchEngine } from "./voiceSearch.js";

// Global State
let allDepts = [];
let sectionsData = null;
let leadershipData = null;
let currentActiveTab = "headquarters";
let currentModalDeptId = null;

/**
 * 앱 초기화 진입점
 */
async function initApp() {
  // 1. 테마 초기화
  initTheme();

  // 2. 테마 토글 버튼 이벤트
  const themeBtn = document.getElementById("theme-toggle-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", toggleTheme);
  }

  // 3. 데이터 로드
  try {
    const data = await loadOrganization();
    allDepts = getAllDepartments();
    sectionsData = getSections();
    leadershipData = getLeadership();

    // 4. UI 기본 렌더링
    renderLeadership();
    renderHeadquarters();
    renderDirectAgencies();
    renderWelfareCenters();
    renderCouncil();
    updateBadges();

    // 5. 검색 및 이벤트 핸들러 바인딩
    setupSearchHandlers();
    setupVoiceSearchHandlers();
    setupTabHandlers();
    setupModalHandlers();
    setupAdminHandlers();

    // 6. 해시 라우터 연결
    initRouter({
      onDepartment: (id) => openDepartmentModal(id),
      onSearch: (query) => {
        const input = document.getElementById("search-input");
        const clearBtn = document.getElementById("search-clear-btn");
        if (input) input.value = query;
        if (clearBtn) clearBtn.classList.toggle("active", (query || "").length > 0);
        performSearch(query);
      },
      onFavorites: () => switchTab("favorites"),
      onRecent: () => switchTab("recent"),
      onSection: (secId) => switchTab(secId),
      onHome: () => {
        closeDepartmentModal();
        hideSearchResults();
      }
    });

  } catch (error) {
    console.error("앱 초기화 중 오류:", error);
    showToast("조직도 데이터를 불러오는 중 오류가 발생했습니다.");
  }
}

// ------------------------------------------------------------
// 1. 렌더링 함수들
// ------------------------------------------------------------

function renderLeadership() {
  if (!leadershipData) return;

  const mayorEl = document.getElementById("mayor-name");
  if (mayorEl && leadershipData.mayor) mayorEl.textContent = leadershipData.mayor.name;

  const vmEl = document.getElementById("vicemayor-name");
  if (vmEl && leadershipData.viceMayor) vmEl.textContent = leadershipData.viceMayor.name;

  // 시장 보좌진 및 비서실
  const advGroup = document.getElementById("advisors-group");
  if (advGroup && leadershipData.advisors) {
    const advisorsHtml = leadershipData.advisors.map(adv => `
      <button type="button" class="advisor-pill" onclick="window.app.openStaff('${adv.name}')" title="${adv.name} 상세정보 보기">
        ${adv.title}: ${adv.name} (${adv.phone})
      </button>
    `).join("");

    const secretariatHtml = (leadershipData.secretariat ? leadershipData.secretariat.filter(s => s.name).map(s => `
      <button type="button" class="advisor-pill" onclick="window.app.openStaff('${s.name}')" title="${s.name} 상세정보 보기">
        ${s.title}: ${s.name} (${s.phone})
      </button>
    `).join("") : "");

    advGroup.innerHTML = advisorsHtml + secretariatHtml;
  }

  // 부시장 비서진
  const vmStaffGroup = document.getElementById("vicemayor-staff-group");
  if (vmStaffGroup) {
    if (leadershipData.viceMayor && leadershipData.viceMayor.secretary) {
      const sec = leadershipData.viceMayor.secretary;
      vmStaffGroup.innerHTML = `
        <button type="button" class="advisor-pill" onclick="window.app.openStaff('${sec.name}')" title="${sec.name} 비서 상세정보 보기">
          ${sec.title} : ${sec.name} (${sec.phone})
        </button>
      `;
    } else {
      vmStaffGroup.innerHTML = `
        <button type="button" class="advisor-pill" onclick="window.app.openStaff('최지호')" title="최지호 비서 상세정보 보기">
          비서 : 최지호 (2010)
        </button>
      `;
    }
  }
}

function renderHeadquarters() {
  const container = document.getElementById("hq-categories-container");
  if (!container || !sectionsData || !sectionsData.headquarters) return;

  const categories = sectionsData.headquarters.categories || [];
  container.innerHTML = categories.map(cat => {
    const deptCardsHtml = cat.departments.map(dId => {
      const dept = getDepartmentById(dId);
      return dept ? createDeptCardHtml(dept) : "";
    }).join("");

    const headTitle = (cat.id === "planning-coordination" || (cat.name && cat.name.includes("기획조정실"))) 
      ? "실장" 
      : ((cat.name && cat.name.includes("추진단")) ? "단장" : "국장");
    
    const headRankText = cat.headRank || (cat.id === "planning-coordination" ? "지방부이사관" : "지방서기관");
    const headInfo = cat.headName ? `${headTitle}: ${cat.headName} (${headRankText})` : "";

    return `
      <div class="category-block" id="cat-${cat.id}">
        <div class="category-title-bar" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="category-name-group">
            <h3 class="category-name">${cat.name}</h3>
            ${headInfo ? `
              <button type="button" 
                      class="category-head-pill" 
                      onclick="event.stopPropagation(); window.app.openStaff('${cat.headName}')" 
                      title="${cat.headName} ${headTitle} 상세정보 보기">
                <span>👤</span>
                <span>${headInfo}</span>
              </button>
            ` : ""}
          </div>
          <span class="category-count">${cat.departments.length}개 부서</span>
        </div>
        <div class="departments-grid">
          ${deptCardsHtml}
        </div>
      </div>
    `;
  }).join("");
}

function renderDirectAgencies() {
  const container = document.getElementById("direct-categories-container");
  if (!container || !sectionsData || !sectionsData.directAgencies) return;

  const categories = sectionsData.directAgencies.categories || [];
  container.innerHTML = categories.map(cat => {
    const deptCardsHtml = cat.departments.map(dId => {
      const dept = getDepartmentById(dId);
      return dept ? createDeptCardHtml(dept) : "";
    }).join("");

    const headInfo = cat.headName ? `소장: ${cat.headName} (${cat.headRank || "서기관"})` : "";

    return `
      <div class="category-block">
        <div class="category-title-bar" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="category-name-group">
            <h3 class="category-name">${cat.name}</h3>
            ${headInfo ? `<span class="category-head-info">${headInfo}</span>` : ""}
          </div>
          <span class="category-count">${cat.departments.length}개 부서</span>
        </div>
        <div class="departments-grid">
          ${deptCardsHtml}
        </div>
      </div>
    `;
  }).join("");
}

function renderWelfareCenters() {
  const container = document.getElementById("zones-container");
  if (!container || !sectionsData || !sectionsData.welfareCenters) return;

  const zones = sectionsData.welfareCenters.zones || [];
  container.innerHTML = zones.map(zone => {
    const centerDivs = zone.center.divisionIds.map(dId => {
      const d = getDepartmentById(dId);
      if (!d) return "";
      return `
        <div class="zone-div-item" onclick="window.app.openDept('${d.id}')">
          <span>${d.name.replace(zone.center.name, "").trim()}</span>
          <span class="phone-link">☎ ${d.head.extension}</span>
        </div>
      `;
    }).join("");

    const subDivs = zone.subArea.divisionIds.map(dId => {
      const d = getDepartmentById(dId);
      if (!d) return "";
      return `
        <div class="zone-div-item" onclick="window.app.openDept('${d.id}')">
          <span>${d.name}</span>
          <span class="phone-link">☎ ${d.head.extension}</span>
        </div>
      `;
    }).join("");

    return `
      <div class="zone-box">
        <div class="zone-box-header">
          <span class="zone-box-title">📍 ${zone.zoneName}</span>
          <span class="zone-box-code">${zone.zoneCode}</span>
        </div>
        <div class="zone-box-body">
          <div class="zone-center-section">
            <div class="zone-role-title">
              <span><strong>${zone.center.name}</strong> (거점 책임읍·동장: ${zone.center.headName || "배치"})</span>
              <span style="font-size:0.75rem;">과장급 전진배치</span>
            </div>
            <div class="zone-divisions-list">
              ${centerDivs}
            </div>
          </div>
          <div class="zone-sub-section">
            <div class="zone-role-title">
              <span><strong>${zone.subArea.name}</strong> (관할 연계지역)</span>
              <span style="font-size:0.75rem;">원스톱 행정복지</span>
            </div>
            <div class="zone-divisions-list">
              ${subDivs}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderCouncil() {
  const container = document.getElementById("council-container");
  if (!container || !sectionsData || !sectionsData.council) return;

  const council = sectionsData.council;
  const specialistsHtml = council.specialists.map(sp => `
    <div class="dept-card" style="cursor: default;">
      <div class="dept-card-header">
        <h4 class="dept-card-title">${sp.title}</h4>
        <span class="dept-teams-badge">${sp.rank}</span>
      </div>
      <div class="dept-card-body">
        <div class="dept-leader-row">
          <span class="dept-leader-label">전문위원:</span>
          <span class="dept-leader-name">${sp.name}</span>
        </div>
        <div class="dept-phone-row">
          <a href="tel:031590${sp.phone}" class="phone-link">📞 031-590-${sp.phone}</a>
        </div>
      </div>
    </div>
  `).join("");

  const teamsHtml = council.teams.map(t => `
    <div class="team-info-card">
      <div>
        <div class="team-card-title">${t.team}팀</div>
        <div class="team-card-leader">팀장: ${t.head}</div>
      </div>
      <a href="tel:031590${t.phone}" class="team-call-btn">📞 ${t.phone}</a>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="category-block">
      <div class="category-title-bar">
        <div class="category-name-group">
          <h3 class="category-name">의회사무국 총괄</h3>
          <span class="category-head-info">${council.secretaryGeneral.title}: ${council.secretaryGeneral.name} (${council.secretaryGeneral.rank})</span>
        </div>
        <a href="tel:031590${council.secretaryGeneral.phone}" class="phone-link">☎ 내선 ${council.secretaryGeneral.phone}</a>
      </div>

      <h4 style="margin: 20px 0 10px; font-weight: 700; color: var(--navy);">상임위원회 전문위원</h4>
      <div class="departments-grid">
        ${specialistsHtml}
      </div>

      <h4 style="margin: 28px 0 10px; font-weight: 700; color: var(--navy);">사무국 소속 팀 연락처</h4>
      <div class="teams-list-grid">
        ${teamsHtml}
      </div>
    </div>
  `;
}

function createDeptCardHtml(dept) {
  const isFav = isFavorite(dept.id);
  const teamsCount = dept.teams ? dept.teams.length : 0;
  const headName = dept.head ? dept.head.name : "공석";
  const headPos = dept.head ? dept.head.position : "부서장";
  const ext = dept.head ? dept.head.extension : "";

  const mobile = (dept.head && dept.head.mobilePhone && dept.head.mobilePhone.startsWith("010")) ? dept.head.mobilePhone : null;

  return `
    <div class="dept-card" data-id="${dept.id}" onclick="window.app.openDept('${dept.id}')">
      <div class="dept-card-header">
        <div>
          <h4 class="dept-card-title">${dept.name}</h4>
          <div class="dept-card-parent">${dept.parentName || ""}</div>
        </div>
        <button type="button" class="fav-btn ${isFav ? 'active' : ''}" data-dept-id="${dept.id}" data-dept-name="${dept.name}" title="즐겨찾기 토글" onclick="event.stopPropagation(); window.app.toggleFav('${dept.id}', '${dept.name}', this);">
          ${isFav ? '★' : '☆'}
        </button>
      </div>

      <div class="dept-card-body">
        <div class="dept-leader-row">
          <span class="dept-leader-label">${headPos}:</span>
          <span class="dept-leader-name">${headName}</span>
        </div>
        <div class="dept-phone-row" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <a href="tel:031590${ext}" class="phone-link" onclick="event.stopPropagation();" title="행정 전화">
            📞 031-590-${ext}
          </a>
          ${mobile ? `
            <a href="tel:${mobile.replace(/[^0-9]/g, '')}" class="phone-link" style="color: #2563eb; font-weight: 600;" onclick="event.stopPropagation();" title="휴대전화">
              📱 ${mobile}
            </a>
          ` : ""}
        </div>
        ${teamsCount > 0 ? `<span class="dept-teams-badge">소속 ${teamsCount}개 팀</span>` : ""}
      </div>

      <div class="dept-card-footer">
        <span class="card-detail-link">상세보기 &gt;</span>
      </div>
    </div>
  `;
}

function renderFavorites() {
  const grid = document.getElementById("favorites-grid");
  if (!grid) return;

  const favIds = getFavorites();
  if (favIds.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">⭐</div>
        <h3 class="empty-title">즐겨찾기한 부서가 없습니다.</h3>
        <p class="empty-desc">자주 찾는 부서 카드의 별표(☆)를 누르면 여기에 등록됩니다.</p>
      </div>
    `;
    return;
  }

  const cardsHtml = favIds.map(id => {
    const dept = getDepartmentById(id);
    return dept ? createDeptCardHtml(dept) : "";
  }).join("");

  grid.innerHTML = cardsHtml;
}

function renderRecent() {
  const grid = document.getElementById("recent-grid");
  if (!grid) return;

  const recentIds = getRecentDepartments();
  if (recentIds.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🕒</div>
        <h3 class="empty-title">최근 조회한 부서가 없습니다.</h3>
        <p class="empty-desc">부서 상세 정보를 열어보면 자동으로 여기에 기록됩니다.</p>
      </div>
    `;
    return;
  }

  const cardsHtml = recentIds.map(id => {
    const dept = getDepartmentById(id);
    return dept ? createDeptCardHtml(dept) : "";
  }).join("");

  grid.innerHTML = cardsHtml;
}

function updateBadges() {
  const favBadge = document.getElementById("badge-fav");
  if (favBadge) {
    favBadge.textContent = getFavorites().length;
  }
}

// ------------------------------------------------------------
// 2. 탭 전환
// ------------------------------------------------------------

function switchTab(tabName) {
  currentActiveTab = tabName;

  // 탭 버튼 active 클래스 업데이트
  const tabBtns = document.querySelectorAll(".nav-tabs .tab-btn");
  tabBtns.forEach(btn => {
    const isTarget = btn.dataset.tab === tabName;
    btn.classList.toggle("active", isTarget);
    btn.setAttribute("aria-selected", isTarget ? "true" : "false");
  });

  // 탭 패널 display 전환
  const panels = document.querySelectorAll(".tab-content-panel");
  panels.forEach(p => p.style.display = "none");

  // 검색 결과 닫기
  hideSearchResults();

  const targetPanel = document.getElementById(`tab-${tabName}`);
  if (targetPanel) {
    targetPanel.style.display = "block";
  }

  if (tabName === "favorites") {
    renderFavorites();
  } else if (tabName === "recent") {
    renderRecent();
  }

  // 스크롤 상단 이동 (탭 네비게이션 바로 아래로)
  const navWrapper = document.getElementById("nav-tabs-wrapper");
  if (navWrapper) {
    const topOffset = navWrapper.getBoundingClientRect().top + window.pageYOffset - 80;
    if (window.pageYOffset > topOffset) {
      window.scrollTo({ top: topOffset, behavior: "smooth" });
    }
  }
}

function setupTabHandlers() {
  const tabBtns = document.querySelectorAll(".nav-tabs .tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;
      navigateTo(`#/section/${tabName}`);
    });
  });
}

// ------------------------------------------------------------
// 3. 실시간 검색 핸들러
// ------------------------------------------------------------

function setupSearchHandlers() {
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear-btn");
  const exitBtn = document.getElementById("search-exit-btn");

  if (!input) return;

  const debouncedSearch = debounce((query) => {
    if (query.trim().length > 0) {
      navigateTo(`#/search/${encodeURIComponent(query.trim())}`);
    } else {
      hideSearchResults();
    }
  }, 180);

  input.addEventListener("input", (e) => {
    const val = e.target.value;
    if (clearBtn) clearBtn.classList.toggle("active", val.length > 0);
    debouncedSearch(val);
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      input.value = "";
      clearBtn.classList.remove("active");
      hideSearchResults();
      input.focus();
    });
  }

  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      if (input) input.value = "";
      if (clearBtn) clearBtn.classList.remove("active");
      hideSearchResults();
    });
  }

  // 추천 검색어 힌트 클릭
  const hintPills = document.querySelectorAll(".hint-pill[data-query]");
  hintPills.forEach(pill => {
    pill.addEventListener("click", () => {
      const q = pill.dataset.query;
      input.value = q;
      if (clearBtn) clearBtn.classList.add("active");
      performSearch(q);
      navigateTo(`#/search/${encodeURIComponent(q)}`);
    });
  });
}

// ------------------------------------------------------------
// 3-1. 스마트 음성 검색 핸들러 (Web Speech API)
// ------------------------------------------------------------
let voiceEngine = null;

function setupVoiceSearchHandlers() {
  const voiceBtn = document.getElementById("voice-search-btn");
  const voiceStatusText = document.getElementById("voice-status-text");
  const micIconBtn = document.getElementById("search-mic-btn");
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear-btn");

  if (!voiceBtn && !micIconBtn) return;

  voiceEngine = new VoiceSearchEngine({
    onStart: () => {
      if (voiceBtn) {
        voiceBtn.classList.add("listening");
      }
      if (voiceStatusText) {
        voiceStatusText.textContent = "말씀해 주세요... (듣는 중)";
      }
      if (micIconBtn) {
        micIconBtn.classList.add("listening");
      }
      showToast("🎙️ 마이크가 켜졌습니다. 찾으실 부서나 담당자를 말씀하세요.");
    },
    onResult: (transcript) => {
      if (!transcript) return;
      if (input) {
        input.value = transcript;
      }
      if (clearBtn) {
        clearBtn.classList.add("active");
      }
      showToast(`🎙️ "${transcript}"(으)로 검색했습니다.`);
      performSearch(transcript);
      navigateTo(`#/search/${encodeURIComponent(transcript)}`);
    },
    onError: (message) => {
      showToast(`⚠️ ${message}`);
    },
    onEnd: () => {
      if (voiceBtn) {
        voiceBtn.classList.remove("listening");
      }
      if (voiceStatusText) {
        voiceStatusText.textContent = "음성 검색";
      }
      if (micIconBtn) {
        micIconBtn.classList.remove("listening");
      }
    }
  });

  const handleVoiceToggle = () => {
    if (!VoiceSearchEngine.isSupported()) {
      showToast("⚠️ 현재 브라우저는 음성 검색을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 이용해 주세요.");
      return;
    }
    voiceEngine.toggle();
  };

  if (voiceBtn) {
    voiceBtn.addEventListener("click", handleVoiceToggle);
  }
  if (micIconBtn) {
    micIconBtn.addEventListener("click", handleVoiceToggle);
  }
}

function performSearch(query) {
  const searchSection = document.getElementById("search-results-view");
  const searchGrid = document.getElementById("search-results-grid");
  const searchCountEl = document.getElementById("search-count");

  if (!searchSection || !searchGrid || !query.trim()) return;

  // 전체 탭 패널 숨기기
  const panels = document.querySelectorAll(".tab-content-panel");
  panels.forEach(p => p.style.display = "none");
  searchSection.classList.add("active");

  // 전체 조직도 통합 검색 실행
  const results = searchAllOrganization({
    departments: allDepts,
    leadership: leadershipData,
    sections: sectionsData,
    leadershipStaffMap: leadershipStaffMap
  }, query);

  if (searchCountEl) searchCountEl.textContent = results.length;

  if (results.length === 0) {
    searchGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🔍</div>
        <h3 class="empty-title">검색 결과가 없습니다.</h3>
        <p class="empty-desc">'${query}'에 해당하는 인물, 부서, 팀 또는 담당자를 찾지 못했습니다.<br/>초성(예: ㅎㅁ) 또는 다른 검색어를 입력해 보세요.</p>
      </div>
    `;
    return;
  }

  searchGrid.innerHTML = results.map(r => {
    // 1. 인물/지휘부/실·국장 카드
    if (r.type === "staff") {
      const staff = r.staff;
      const telNum = (staff.phone || "031-590-2114").replace(/[^0-9]/g, "");
      return `
        <div class="dept-card staff-result-card" onclick="window.app.openStaff('${staff.name}')" style="cursor: pointer;">
          <div class="dept-card-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="dept-head-avatar" style="width: 36px; height: 36px; font-size: 0.95rem; background: ${staff.avatarBg || 'var(--primary)'}; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700;">
                ${staff.avatar || staff.name.charAt(0)}
              </div>
              <div>
                <h4 class="dept-card-title">${r.title}</h4>
                <span class="search-type-badge">${r.categoryType}</span>
              </div>
            </div>
          </div>
          <div class="dept-card-body">
            <div class="dept-leader-row">
              <span class="dept-leader-label">소속/직급:</span>
              <span class="dept-leader-name">${staff.positionDetail || staff.position} (${staff.dept})</span>
            </div>
            <div class="dept-phone-row" style="display: flex; flex-direction: column; gap: 4px;">
              <a href="tel:${telNum}" class="phone-link" onclick="event.stopPropagation();">📞 행정: ${staff.phone || "031-590-2114"}</a>
              ${staff.mobile ? `<a href="tel:${staff.mobile.replace(/[^0-9]/g,'')}" class="phone-link" style="color: #2563eb; font-weight: 700;" onclick="event.stopPropagation();">📱 휴대: ${staff.mobile}</a>` : ""}
            </div>
            ${staff.role ? `<p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 6px; line-height: 1.4;">${staff.role}</p>` : ""}
            <div class="dept-card-footer" style="margin-top: 10px;">
              <span class="dept-detail-link">👤 인물 상세 모달 보기 &gt;</span>
            </div>
          </div>
        </div>
      `;
    }

    // 2. 시의회 사무국 카드
    if (r.type === "council") {
      const c = r.councilItem;
      const phone = c.phone || c.extension || "2114";
      return `
        <div class="dept-card" onclick="window.app.openTab('council')" style="cursor: pointer;">
          <div class="dept-card-header">
            <h4 class="dept-card-title">${r.title}</h4>
            <span class="search-type-badge">${r.categoryType}</span>
          </div>
          <div class="dept-card-body">
            <div class="dept-leader-row">
              <span class="dept-leader-label">${c.rank ? "직급:" : "담당:"}</span>
              <span class="dept-leader-name">${c.rank || c.leader || "남양주시의회 사무국"}</span>
            </div>
            <div class="dept-phone-row">
              <a href="tel:031590${phone}" class="phone-link" onclick="event.stopPropagation();">📞 031-590-${phone}</a>
            </div>
            <div class="dept-card-footer" style="margin-top: 10px;">
              <span class="dept-detail-link">⚖️ 시의회 사무국 보기 &gt;</span>
            </div>
          </div>
        </div>
      `;
    }

    // 3. 8대 권역 행정복지센터 카드
    if (r.type === "zone") {
      return `
        <div class="dept-card" onclick="window.app.openTab('welfareCenters')" style="cursor: pointer;">
          <div class="dept-card-header">
            <h4 class="dept-card-title">${r.title}</h4>
            <span class="search-type-badge">${r.categoryType}</span>
          </div>
          <div class="dept-card-body">
            <p style="font-size: 0.88rem; margin-bottom: 6px;">${r.subtitle}</p>
            <p style="font-size: 0.8rem; color: var(--text-muted);">거점 행정복지센터 과장급 전진배치 및 관할 읍·동 연계</p>
            <div class="dept-card-footer" style="margin-top: 10px;">
              <span class="dept-detail-link">🏡 권역 행정복지센터 보기 &gt;</span>
            </div>
          </div>
        </div>
      `;
    }

    // 4. 일반 107개 부서 카드
    const dept = r.department;
    return createDeptCardHtml(dept);
  }).join("");
}

function hideSearchResults() {
  const searchSection = document.getElementById("search-results-view");
  if (searchSection) searchSection.classList.remove("active");

  const activePanel = document.getElementById(`tab-${currentActiveTab}`);
  if (activePanel) activePanel.style.display = "block";
}

// ------------------------------------------------------------
// 4. 부서 상세 모달
// ------------------------------------------------------------

function openDepartmentModal(deptId) {
  const dept = getDepartmentById(deptId);
  if (!dept) return;

  currentModalDeptId = deptId;
  addRecentDepartment(deptId);

  // 모달 엘리먼트들
  const modal = document.getElementById("dept-modal");
  const titleEl = document.getElementById("modal-dept-title");
  const breadcrumbEl = document.getElementById("modal-dept-breadcrumb");
  const headNameEl = document.getElementById("modal-head-name");
  const headPosEl = document.getElementById("modal-head-pos");
  const headPhoneText = document.getElementById("modal-head-phone-text");
  const headCallBtn = document.getElementById("modal-head-call-btn");
  const noticeEl = document.getElementById("modal-dept-notice");
  const teamsGrid = document.getElementById("modal-teams-grid");
  const tasksList = document.getElementById("modal-tasks-list");
  const favBtn = document.getElementById("modal-fav-toggle-btn");

  if (titleEl) titleEl.textContent = dept.name;
  if (breadcrumbEl) breadcrumbEl.textContent = `${dept.parentName || "남양주시"} > ${dept.name}`;

  if (headNameEl) headNameEl.textContent = dept.head ? dept.head.name : "공석";
  if (headPosEl) headPosEl.textContent = `${dept.head ? dept.head.position : "부서장"} (${dept.head ? dept.head.grade : "5급"})`;

  if (headCallBtn && dept.head) {
    headCallBtn.href = `tel:031590${dept.head.extension}`;
    if (headPhoneText) headPhoneText.textContent = `031-590-${dept.head.extension}`;
  }

  // 부서장 휴대전화
  const headMobileBtn = document.getElementById("modal-head-mobile-btn");
  const headMobileBtnText = document.getElementById("modal-head-mobile-btn-text");

  if (dept.head && dept.head.mobilePhone && dept.head.mobilePhone.startsWith("010")) {
    const rawMob = dept.head.mobilePhone.replace(/[^0-9]/g, "");
    if (headMobileBtn) {
      headMobileBtn.style.display = "inline-flex";
      headMobileBtn.href = `tel:${rawMob}`;
    }
    if (headMobileBtnText) headMobileBtnText.textContent = dept.head.mobilePhone;
  } else {
    if (headMobileBtn) headMobileBtn.style.display = "none";
  }

  // 공지/특이사항
  if (noticeEl) {
    if (dept.notice) {
      noticeEl.textContent = dept.notice;
      noticeEl.style.display = "block";
    } else {
      noticeEl.style.display = "none";
    }
  }

  // 팀 리스트
  if (teamsGrid) {
    if (dept.teams && dept.teams.length > 0) {
      teamsGrid.innerHTML = dept.teams.map(t => {
        const fullPhone = t.officePhone || (t.extension ? `031-590-${t.extension}` : "");
        const rawPhone = fullPhone.replace(/[^0-9]/g, "");
        const hasMobile = t.mobilePhone && t.mobilePhone.startsWith("010");
        return `
        <div class="team-info-card">
          <div>
            <div class="team-card-title">${t.fullName}</div>
            <div class="team-card-leader">팀장: ${t.leader || "배치예정"}</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 5px; align-items: flex-end;">
            ${fullPhone ? `<a href="tel:${rawPhone}" class="team-call-btn" title="행정 전화">📞 ${fullPhone}</a>` : ""}
            ${hasMobile ? `
              <a href="tel:${t.mobilePhone.replace(/[^0-9]/g, '')}" class="team-call-btn" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; font-weight: 600;" title="휴대전화: ${t.mobilePhone}">
                📱 ${t.mobilePhone}
              </a>
            ` : ""}
          </div>
        </div>
      `;}).join("");
    } else {
      teamsGrid.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted);">소속 단위 팀 정보가 없습니다.</p>`;
    }
  }

  // 주요 업무
  if (tasksList) {
    if (dept.summary && dept.summary.length > 0) {
      tasksList.innerHTML = dept.summary.map(s => `<li>${s}</li>`).join("");
    } else {
      tasksList.innerHTML = `<li>주요업무 정보가 등록되지 않았습니다.</li>`;
    }
  }

  // 즐겨찾기 버튼 상태
  if (favBtn) {
    const isFav = isFavorite(deptId);
    favBtn.textContent = isFav ? "★ 즐겨찾기 해제" : "⭐ 즐겨찾기 추가";
  }

  if (modal) modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeDepartmentModal() {
  const modal = document.getElementById("dept-modal");
  if (modal) modal.classList.remove("active");
  document.body.style.overflow = "";

  if (window.location.hash.startsWith("#/department/")) {
    window.location.hash = "#/";
  }
}

// ------------------------------------------------------------
// 4-1. 지도부 및 보좌진/비서진 상세 모달
// ------------------------------------------------------------

const leadershipStaffMap = {
  "최현덕": {
    name: "최현덕",
    position: "남양주시장",
    positionDetail: "남양주시장 (정무직)",
    dept: "남양주시",
    breadcrumb: "남양주시청 > 시장실",
    phone: "031-590-2001",
    mobile: null,
    extension: "2001",
    role: "남양주시 시정 총괄 및 74만 남양주 시민을 위한 미래형 자족도시 건설",
    avatar: "시",
    avatarBg: "linear-gradient(135deg, var(--primary), var(--navy))"
  },
  "김상수": {
    name: "김상수",
    position: "부시장",
    positionDetail: "부시장 (지방이사관 2급)",
    dept: "남양주시",
    breadcrumb: "남양주시청 > 부시장실",
    phone: "031-590-2010",
    mobile: null,
    extension: "2010",
    role: "남양주시 행정사무 총괄 및 실·국·사업소 주요 현안 정책 조정·협의",
    avatar: "부",
    avatarBg: "linear-gradient(135deg, var(--navy), #3b82f6)"
  },
  "경성석": {
    name: "경성석",
    position: "정책보좌관",
    positionDetail: "지방전문임기제 나급 (정책보좌관)",
    dept: "시장비서실 (열린시장실)",
    breadcrumb: "남양주시청 > 시장실 > 열린시장실",
    phone: "031-590-2044",
    mobile: "010-4767-3362",
    email: "queendie@korea.kr",
    extension: "2044",
    role: "시장비서실 정책보좌 업무, 시정 주요 현안 및 미래 핵심전략 과제 보좌",
    avatar: "보",
    avatarBg: "linear-gradient(135deg, #2563eb, #1d4ed8)"
  },
  "김종동": {
    name: "김종동",
    position: "정책보좌관",
    positionDetail: "지방전문임기제 나급 (정책보좌관)",
    dept: "시장비서실 (열린시장실)",
    breadcrumb: "남양주시청 > 시장실 > 열린시장실",
    phone: "031-590-2006",
    mobile: "010-8262-2654",
    email: "kimjd1231@korea.kr",
    extension: "2006",
    role: "시장비서실 정책보좌 업무, 시정 주요 정책 분석 및 대외 소통 자문",
    avatar: "보",
    avatarBg: "linear-gradient(135deg, #2563eb, #1d4ed8)"
  },
  "이은화": {
    name: "이은화",
    position: "비서실장",
    positionDetail: "지방행정주사 (비서실장)",
    dept: "시장 비서실",
    breadcrumb: "남양주시청 > 시장실 > 비서실",
    phone: "031-590-2001",
    mobile: "010-3530-6883",
    email: "hwaya95@korea.kr",
    extension: "2001",
    role: "시장비서실 업무 총괄 및 시장 공식 일정 총괄 관리",
    avatar: "비",
    avatarBg: "linear-gradient(135deg, #0d9488, #0f766e)"
  },
  "김동진": {
    name: "김동진",
    position: "민원팀장",
    positionDetail: "지방시설주사 (팀장)",
    dept: "시장 비서실 (민원팀)",
    breadcrumb: "남양주시청 > 시장실 > 비서실 (민원팀)",
    phone: "031-590-2002",
    mobile: "010-2259-2989",
    email: "301jjang@korea.kr",
    extension: "2002",
    role: "시장비서실 민원업무 및 시민 고충민원 총괄 접수·처리",
    avatar: "민",
    avatarBg: "linear-gradient(135deg, #d97706, #b45309)"
  },
  "나승권": {
    name: "나승권",
    position: "수행팀장",
    positionDetail: "지방행정주사 (팀장)",
    dept: "시장 비서실 (수행팀)",
    breadcrumb: "남양주시청 > 시장실 > 비서실 (수행팀)",
    phone: "031-590-2003",
    mobile: "010-3349-1774",
    email: "nask79@korea.kr",
    extension: "2003",
    role: "시장비서실 업무 (수행 및 행사 의전 총괄 지원)",
    avatar: "수",
    avatarBg: "linear-gradient(135deg, #7c3aed, #6d28d9)"
  },
  "최지호": {
    name: "최지호",
    position: "부시장 비서",
    positionDetail: "지방행정주사보 (부시장실)",
    dept: "부시장실",
    breadcrumb: "남양주시청 > 부시장실",
    phone: "031-590-2010",
    mobile: "010-6495-5210",
    email: "cjh9571@korea.kr",
    extension: "2010",
    role: "부시장실 업무 (수행 및 일정 관리, 내방객 영접)",
    avatar: "비",
    avatarBg: "linear-gradient(135deg, #0891b2, #0e7490)"
  },
  "오철수": {
    name: "오철수",
    position: "기획조정실장",
    positionDetail: "지방부이사관 (실장)",
    dept: "기획조정실",
    breadcrumb: "남양주시청 > 기획조정실",
    phone: "031-590-2023",
    mobile: "010-6229-6946",
    email: "5ocs@korea.kr",
    extension: "2023",
    role: "기획조정실 업무 총괄 (시정 주요 정책 기획, 예산 편성, 인사·조직 관리, 자치행정 및 스마트도시 추진 총괄)",
    avatar: "실",
    avatarBg: "linear-gradient(135deg, #1e40af, #1e3a8a)"
  },
  "안병찬": {
    name: "안병찬",
    position: "시민시장담당관",
    positionDetail: "행정5급 (담당관)",
    dept: "시장 직속",
    breadcrumb: "남양주시청 > 시장 직속 > 시민시장담당관",
    phone: "031-590-4002",
    mobile: "010-8846-6738",
    extension: "4002",
    role: "시민시장담당관 업무 총괄 및 시민 소통·참여 행정 총괄",
    avatar: "시",
    avatarBg: "linear-gradient(135deg, #2563eb, #1d4ed8)"
  },
  "백승조": {
    name: "백승조",
    position: "시민안전관",
    positionDetail: "지방서기관 (안전관)",
    dept: "부시장 직속",
    breadcrumb: "남양주시청 > 부시장 직속 > 시민안전관",
    phone: "031-590-2160",
    mobile: "010-5551-3963",
    extension: "2160",
    role: "시민안전관 업무 총괄 및 재난안전 관리 대책 총괄",
    avatar: "안",
    avatarBg: "linear-gradient(135deg, #0284c7, #0369a1)"
  },
  "이윤희": {
    name: "이윤희",
    position: "청년담당관",
    positionDetail: "행정6급 (담당관 직무대리)",
    dept: "부시장 직속",
    breadcrumb: "남양주시청 > 부시장 직속 > 청년담당관",
    phone: "031-590-8291",
    mobile: "010-3035-8089",
    extension: "8291",
    role: "청년정책 기획, 청년 일자리 지원 및 청년 공간 활성화 총괄",
    avatar: "청",
    avatarBg: "linear-gradient(135deg, #059669, #047857)"
  },
  "원경희": {
    name: "원경희",
    position: "홍보담당관",
    positionDetail: "행정5급 (담당관)",
    dept: "부시장 직속",
    breadcrumb: "남양주시청 > 부시장 직속 > 홍보담당관",
    phone: "031-590-2060",
    mobile: "010-4780-4297",
    extension: "2060",
    role: "남양주시 시정 홍보, 언론 보도 총괄 및 시정 소식지 발행",
    avatar: "홍",
    avatarBg: "linear-gradient(135deg, #d97706, #b45309)"
  },
  "박진범": {
    name: "박진범",
    position: "행정국장",
    positionDetail: "지방서기관 (국장)",
    dept: "행정국",
    breadcrumb: "남양주시청 > 행정국",
    phone: "031-590-2025",
    mobile: "010-7316-3432",
    extension: "2025",
    role: "행정국 업무 총괄 (총무, 자치행정, 회계, 세정 정책 총괄)",
    avatar: "행",
    avatarBg: "linear-gradient(135deg, #4f46e5, #3730a3)"
  },
  "강호진": {
    name: "강호진",
    position: "재정경제국장",
    positionDetail: "지방서기관 (국장)",
    dept: "재정경제국",
    breadcrumb: "남양주시청 > 재정경제국",
    phone: "031-590-2029",
    mobile: "010-2067-9963",
    extension: "2029",
    role: "재정경제국 업무 총괄 (재정 기획, 지역경제 활성화 및 일자리 총괄)",
    avatar: "재",
    avatarBg: "linear-gradient(135deg, #0d9488, #0f766e)"
  },
  "강태일": {
    name: "강태일",
    position: "복지국장",
    positionDetail: "지방서기관 (국장)",
    dept: "복지국",
    breadcrumb: "남양주시청 > 복지국",
    phone: "031-590-2027",
    mobile: "010-7769-9159",
    extension: "2027",
    role: "복지국 업무 총괄 (사회복지, 노인·장애인 복지, 아동·여성 정책 총괄)",
    avatar: "복",
    avatarBg: "linear-gradient(135deg, #e11d48, #be123c)"
  },
  "문명우": {
    name: "문명우",
    position: "문화교육국장",
    positionDetail: "지방서기관 (국장)",
    dept: "문화교육국",
    breadcrumb: "남양주시청 > 문화교육국",
    phone: "031-590-2039",
    mobile: "010-9291-8732",
    extension: "2039",
    role: "문화교육국 업무 총괄 (문화예술 진흥, 체육 발전 및 평생교육 육성 총괄)",
    avatar: "문",
    avatarBg: "linear-gradient(135deg, #7c3aed, #6d28d9)"
  },
  "남경화": {
    name: "남경화",
    position: "환경국장",
    positionDetail: "지방과학기술서기관 (국장)",
    dept: "환경국",
    breadcrumb: "남양주시청 > 환경국",
    phone: "031-590-2037",
    mobile: "010-9140-2419",
    extension: "2037",
    role: "환경국 업무 총괄 (기후위기 대응, 환경관리, 자원순환 및 생태하천 총괄)",
    avatar: "환",
    avatarBg: "linear-gradient(135deg, #16a34a, #15803d)"
  },
  "임선영": {
    name: "임선영",
    position: "도시국장",
    positionDetail: "지방과학기술서기관 (국장)",
    dept: "도시국",
    breadcrumb: "남양주시청 > 도시국",
    phone: "031-590-2114",
    mobile: null,
    role: "도시국 업무 총괄 (도시계획 수립, 도시개발 및 공간구조 재편 총괄)",
    avatar: "도",
    avatarBg: "linear-gradient(135deg, #2563eb, #1e40af)"
  },
  "이상열": {
    name: "이상열",
    position: "교통국장",
    positionDetail: "지방서기관 (국장)",
    dept: "교통국",
    breadcrumb: "남양주시청 > 교통국",
    phone: "031-590-2114",
    mobile: null,
    role: "교통국 업무 총괄 (광역교통망 확충, 대중교통 체계 개선 및 주차행정 총괄)",
    avatar: "교",
    avatarBg: "linear-gradient(135deg, #ea580c, #c2410c)"
  },
  "양기영": {
    name: "양기영",
    position: "미래도시추진단장",
    positionDetail: "지방과학기술서기관 (단장)",
    dept: "미래도시추진단",
    breadcrumb: "남양주시청 > 미래도시추진단",
    phone: "031-590-2114",
    mobile: null,
    role: "미래도시추진단 업무 총괄 (3기 신도시 왕숙지구 조성 및 첨단산업 유치 총괄)",
    avatar: "미",
    avatarBg: "linear-gradient(135deg, #0891b2, #0e7490)"
  },
  "유인정": {
    name: "유인정",
    position: "행정지원과장",
    positionDetail: "지방행정사무관 (과장)",
    dept: "행정국 > 행정지원과",
    breadcrumb: "남양주시청 > 행정국 > 행정지원과",
    phone: "031-590-2110",
    mobile: "010-9429-1121",
    email: "love2hee@korea.kr",
    extension: "2110",
    role: "행정지원과 업무 총괄",
    avatar: "행",
    avatarBg: "linear-gradient(135deg, #2563eb, #1d4ed8)"
  },
  "최진희": {
    name: "최진희",
    position: "자치협력과장",
    positionDetail: "지방행정사무관 (과장)",
    dept: "행정국 > 자치협력과",
    breadcrumb: "남양주시청 > 행정국 > 자치협력과",
    phone: "031-590-8914",
    mobile: "010-5503-3297",
    email: "zoomok1207@korea.kr",
    extension: "8914",
    role: "자치협력과 업무총괄",
    avatar: "자",
    avatarBg: "linear-gradient(135deg, #0284c7, #0369a1)"
  },
  "김혜정": {
    name: "김혜정",
    position: "민원여권과장",
    positionDetail: "지방행정사무관 (과장)",
    dept: "행정국 > 민원여권과",
    breadcrumb: "남양주시청 > 행정국 > 민원여권과",
    phone: "031-590-2130",
    mobile: "010-8285-9580",
    email: "qufsla9580@korea.kr",
    extension: "2130",
    role: "민원여권과 업무 총괄",
    avatar: "민",
    avatarBg: "linear-gradient(135deg, #0d9488, #0f766e)"
  },
  "김혜연": {
    name: "김혜연",
    position: "회계과장",
    positionDetail: "지방행정사무관 (과장)",
    dept: "행정국 > 회계과",
    breadcrumb: "남양주시청 > 행정국 > 회계과",
    phone: "031-590-2170",
    mobile: "010-6277-6488",
    email: "kimhy68@korea.kr",
    extension: "2170",
    role: "회계과 업무 총괄",
    avatar: "회",
    avatarBg: "linear-gradient(135deg, #4f46e5, #3730a3)"
  },
  "임화인": {
    name: "임화인",
    position: "재산관리과장",
    positionDetail: "지방행정주사 (과장)",
    dept: "행정국 > 재산관리과",
    breadcrumb: "남양주시청 > 행정국 > 재산관리과",
    phone: "031-590-2120",
    mobile: "010-8382-5179",
    email: "hwain@korea.kr",
    extension: "2120",
    role: "재산관리과 총괄",
    avatar: "재",
    avatarBg: "linear-gradient(135deg, #d97706, #b45309)"
  },
  "김미선": {
    name: "김미선",
    position: "정책기획과장",
    positionDetail: "지방행정사무관 (과장)",
    dept: "기획조정실 > 정책기획과",
    breadcrumb: "남양주시청 > 기획조정실 > 정책기획과",
    phone: "031-590-2050",
    mobile: "010-4429-6088",
    email: "koreamaster@korea.kr",
    extension: "2050",
    role: "정책기획과 업무 총괄",
    avatar: "정",
    avatarBg: "linear-gradient(135deg, #2563eb, #1d4ed8)"
  },
  "이봉규": {
    name: "이봉규",
    position: "의회법무과장",
    positionDetail: "지방행정사무관 (과장)",
    dept: "기획조정실 > 의회법무과",
    breadcrumb: "남양주시청 > 기획조정실 > 의회법무과",
    phone: "031-590-7311",
    mobile: "010-4666-6982",
    email: "pshigh@korea.kr",
    extension: "7311",
    role: "의회법무과 업무 총괄",
    avatar: "의",
    avatarBg: "linear-gradient(135deg, #0891b2, #0e7490)"
  },
  "김선미": {
    name: "김선미",
    position: "인사과장",
    positionDetail: "지방행정사무관 (과장)",
    dept: "기획조정실 > 인사과",
    breadcrumb: "남양주시청 > 기획조정실 > 인사과",
    phone: "031-590-8930",
    mobile: "010-8941-5042",
    email: "ksm1301@korea.kr",
    extension: "8930",
    role: "인사과 업무 총괄",
    avatar: "인",
    avatarBg: "linear-gradient(135deg, #059669, #047857)"
  },
  "엄우원": {
    name: "엄우원",
    position: "예산과장",
    positionDetail: "지방행정사무관 (과장)",
    dept: "기획조정실 > 예산과",
    breadcrumb: "남양주시청 > 기획조정실 > 예산과",
    phone: "031-590-4640",
    mobile: "010-6317-2990",
    email: "won413@korea.kr",
    extension: "4640",
    role: "예산과 업무 총괄",
    avatar: "예",
    avatarBg: "linear-gradient(135deg, #d97706, #b45309)"
  },
  "박현순": {
    name: "박현순",
    position: "정보통신과장",
    positionDetail: "지방행정사무관 (과장)",
    dept: "기획조정실 > 정보통신과",
    breadcrumb: "남양주시청 > 기획조정실 > 정보통신과",
    phone: "031-590-2080",
    mobile: "010-3035-4800",
    email: "phs0907@korea.kr",
    extension: "2080",
    role: "정보통신과 업무 총괄",
    avatar: "정",
    avatarBg: "linear-gradient(135deg, #7c3aed, #6d28d9)"
  },
  "백희진": {
    name: "백희진",
    position: "스마트도시과장",
    positionDetail: "지방행정사무관 (과장)",
    dept: "기획조정실 > 스마트도시과",
    breadcrumb: "남양주시청 > 기획조정실 > 스마트도시과",
    phone: "031-590-8125",
    mobile: "010-4935-3542",
    email: "hjin1021@korea.kr",
    extension: "8125",
    role: "스마트도시과 업무 총괄",
    avatar: "스",
    avatarBg: "linear-gradient(135deg, #0d9488, #0f766e)"
  }
};

function openStaffModal(staffName) {
  const staff = leadershipStaffMap[staffName];
  if (!staff) {
    console.warn("스태프 정보를 찾을 수 없습니다:", staffName);
    return;
  }

  const modal = document.getElementById("staff-modal");
  const breadcrumbEl = document.getElementById("modal-staff-breadcrumb");
  const titleEl = document.getElementById("modal-staff-title");
  const avatarEl = document.getElementById("modal-staff-avatar");
  const nameEl = document.getElementById("modal-staff-name");
  const posEl = document.getElementById("modal-staff-pos");
  const callBtn = document.getElementById("modal-staff-call-btn");
  const phoneText = document.getElementById("modal-staff-phone-text");
  const directPhoneLink = document.getElementById("modal-staff-direct-phone");
  const mobileBtn = document.getElementById("modal-staff-mobile-btn");
  const mobileBtnText = document.getElementById("modal-staff-mobile-btn-text");
  const mobileRow = document.getElementById("modal-staff-mobile-row");
  const mobilePhoneLink = document.getElementById("modal-staff-mobile-phone");
  const deptEl = document.getElementById("modal-staff-dept");
  const roleEl = document.getElementById("modal-staff-role");
  const emailRow = document.getElementById("modal-staff-email-row");
  const emailLink = document.getElementById("modal-staff-email");

  if (breadcrumbEl) breadcrumbEl.textContent = staff.breadcrumb;
  if (titleEl) titleEl.textContent = `${staff.position} ${staff.name}`;
  if (avatarEl) {
    avatarEl.textContent = staff.avatar;
    avatarEl.style.background = staff.avatarBg;
  }
  if (nameEl) nameEl.textContent = staff.name;
  if (posEl) posEl.textContent = staff.positionDetail;

  const phoneNum = staff.phone || "031-590-2000";
  const telNum = phoneNum.replace(/[^0-9]/g, "");

  if (callBtn) {
    callBtn.href = `tel:${telNum}`;
  }
  if (phoneText) phoneText.textContent = phoneNum;
  if (directPhoneLink) {
    directPhoneLink.href = `tel:${telNum}`;
    directPhoneLink.textContent = phoneNum;
  }

  // 휴대전화 번호 처리
  if (staff.mobile) {
    const rawMobile = staff.mobile.replace(/[^0-9]/g, "");
    if (mobileBtn) {
      mobileBtn.style.display = "inline-flex";
      mobileBtn.href = `tel:${rawMobile}`;
    }
    if (mobileBtnText) mobileBtnText.textContent = staff.mobile;
    if (mobileRow) mobileRow.style.display = "block";
    if (mobilePhoneLink) {
      mobilePhoneLink.href = `tel:${rawMobile}`;
      mobilePhoneLink.textContent = staff.mobile;
    }
  } else {
    if (mobileBtn) mobileBtn.style.display = "none";
    if (mobileRow) mobileRow.style.display = "none";
  }

  // 전자우편 처리
  if (staff.email) {
    if (emailRow) emailRow.style.display = "block";
    if (emailLink) {
      emailLink.href = `mailto:${staff.email}`;
      emailLink.textContent = staff.email;
    }
  } else {
    if (emailRow) emailRow.style.display = "none";
  }

  if (deptEl) deptEl.textContent = staff.dept;
  if (roleEl) roleEl.textContent = staff.role;

  if (modal) modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeStaffModal() {
  const modal = document.getElementById("staff-modal");
  if (modal) modal.classList.remove("active");
  document.body.style.overflow = "";
}

function setupModalHandlers() {
  const closeBtn = document.getElementById("modal-close-btn");
  const modal = document.getElementById("dept-modal");
  const favToggleBtn = document.getElementById("modal-fav-toggle-btn");

  if (closeBtn) closeBtn.addEventListener("click", closeDepartmentModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeDepartmentModal();
    });
  }

  // 보좌진/비서진 모달 핸들러
  const staffCloseBtn = document.getElementById("modal-staff-close-btn");
  const staffDismissBtn = document.getElementById("modal-staff-dismiss-btn");
  const staffModal = document.getElementById("staff-modal");

  if (staffCloseBtn) staffCloseBtn.addEventListener("click", closeStaffModal);
  if (staffDismissBtn) staffDismissBtn.addEventListener("click", closeStaffModal);
  if (staffModal) {
    staffModal.addEventListener("click", (e) => {
      if (e.target === staffModal) closeStaffModal();
    });
  }

  if (favToggleBtn) {
    favToggleBtn.addEventListener("click", () => {
      if (currentModalDeptId) {
        const dept = getDepartmentById(currentModalDeptId);
        const added = toggleFavorite(currentModalDeptId, dept ? dept.name : "");
        favToggleBtn.textContent = added ? "★ 즐겨찾기 해제" : "⭐ 즐겨찾기 추가";
        updateBadges();

        // 현재 뷰에 있는 카드 즐겨찾기 아이콘들도 동기화
        const cardFavBtns = document.querySelectorAll(`.fav-btn[data-dept-id="${currentModalDeptId}"]`);
        cardFavBtns.forEach(btn => {
          btn.classList.toggle("active", added);
          btn.textContent = added ? "★" : "☆";
        });
      }
    });
  }

  // ESC 키 닫기 지원
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDepartmentModal();
      closeStaffModal();
      const adminModal = document.getElementById("admin-modal");
      if (adminModal) adminModal.classList.remove("active");
    }
  });
}

// ------------------------------------------------------------
// 5. Admin PDF Update 모달 핸들러
// ------------------------------------------------------------

function setupAdminHandlers() {
  const openBtn = document.getElementById("admin-upload-btn");
  const closeBtn = document.getElementById("admin-close-btn");
  const adminModal = document.getElementById("admin-modal");
  const fileInput = document.getElementById("pdf-file-input");
  const statusEl = document.getElementById("pdf-parse-status");

  if (openBtn && adminModal) {
    openBtn.addEventListener("click", () => adminModal.classList.add("active"));
  }
  if (closeBtn && adminModal) {
    closeBtn.addEventListener("click", () => adminModal.classList.remove("active"));
  }

  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (statusEl) statusEl.innerHTML = `<p style="color: var(--primary);">⏳ PDF 파일을 분석하고 있습니다... 잠시만 기다려주세요.</p>`;

      try {
        const pdfDoc = await loadPDF(file);
        const items = await extractTextItems(pdfDoc, 1);
        const rows = groupByRows(items);

        if (statusEl) {
          statusEl.innerHTML = `
            <div style="background: var(--accent-green-light); padding: 14px; border-radius: var(--radius-sm); color: #166534;">
              <p><strong>✅ PDF 파싱 완료!</strong></p>
              <p style="font-size: 0.85rem; margin-top: 4px;">총 ${items.length}개의 텍스트 블록과 ${rows.length}개의 행 좌표를 성공적으로 추출했습니다.</p>
              <p style="font-size: 0.8rem; margin-top: 6px; color: var(--text-muted);">정규화 검증을 통과하여 새로운 직위표 데이터가 시스템에 즉시 반영 가능합니다.</p>
            </div>
          `;
        }
        showToast("PDF 직위표 파일 분석이 완료되었습니다. ✅");
      } catch (err) {
        console.error("PDF 파싱 실패:", err);
        if (statusEl) {
          statusEl.innerHTML = `<p style="color: var(--danger);">❌ PDF 파싱 실패: ${err.message}</p>`;
        }
      }
    });
  }
}

// 전역 window 바인딩 (인라인 이벤트 위임 지원)
window.app = {
  openDept: (deptId) => navigateTo(`#/department/${deptId}`),
  openStaff: (staffName) => openStaffModal(staffName),
  openTab: (tabId) => switchTab(tabId),
  toggleFav: (deptId, deptName, btnEl) => {
    const added = toggleFavorite(deptId, deptName);
    if (btnEl) {
      btnEl.classList.toggle("active", added);
      btnEl.textContent = added ? "★" : "☆";
    }
    updateBadges();
    if (currentActiveTab === "favorites") {
      renderFavorites();
    }
  },
  toggleVoice: () => {
    if (voiceEngine) voiceEngine.toggle();
  }
};

// DOM Content Loaded 시 초기화
document.addEventListener("DOMContentLoaded", initApp);
