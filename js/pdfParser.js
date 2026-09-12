/**
 * 남양주시 스마트 조직도 - PDF Parser & Validation Module
 * PDF.js 라이브러리를 활용하여 직위표 PDF에서 텍스트 좌표를 추출하고
 * 부서, 직위, 성명, 내선번호를 인식하여 정규화 JSON으로 변환합니다.
 */

/**
 * 브라우저 환경에서 PDF.js CDN 라이브러리를 동적으로 로드합니다.
 */
export async function ensurePdfJsLoaded() {
  if (window.pdfjsLib) return window.pdfjsLib;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("PDF.js 라이브러리 로드에 실패했습니다."));
    document.head.appendChild(script);
  });
}

/**
 * 파일(File 객체 또는 ArrayBuffer)로부터 PDF 문서를 로드합니다.
 */
export async function loadPDF(fileOrBuffer) {
  const pdfjs = await ensurePdfJsLoaded();
  let loadingTask;

  if (fileOrBuffer instanceof File) {
    const arrayBuffer = await fileOrBuffer.arrayBuffer();
    loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  } else {
    loadingTask = pdfjs.getDocument({ data: fileOrBuffer });
  }

  return await loadingTask.promise;
}

/**
 * PDF 페이지의 텍스트 항목과 좌표(x, y)를 추출합니다.
 */
export async function extractTextItems(pdfDoc, pageNumber = 1) {
  const page = await pdfDoc.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 });

  const items = textContent.items.map((item) => {
    const transform = item.transform;
    return {
      str: item.str.trim(),
      x: Math.round(transform[4]),
      y: Math.round(viewport.height - transform[5]), // 위에서 아래로 Y 좌표 정규화
      width: Math.round(item.width),
      height: Math.round(item.height)
    };
  }).filter((it) => it.str.length > 0);

  return items;
}

/**
 * Y 좌표를 기준으로 텍스트 아이템들을 행(Row) 단위로 그룹화합니다.
 */
export function groupByRows(items, tolerance = 6) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];

  for (const item of sorted) {
    let row = rows.find((r) => Math.abs(r.y - item.y) <= tolerance);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }

  // 각 행 내에서 X 좌표순으로 정렬
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
  }

  return rows.sort((a, b) => a.y - b.y);
}

/**
 * 부서명 식별 규칙 (○○국, ○○과, ○○관, ○○소, ○○읍, ○○면, ○○동)
 */
export function detectDepartment(str) {
  const clean = str.replace(/\s+/g, "");
  return /(실|국|과|관|센터|사업소|읍|면|동)$/.test(clean);
}

/**
 * 직위/직급 식별 규칙 (○○장, ○급 등)
 */
export function detectPosition(str) {
  const clean = str.replace(/\s+/g, "");
  return /(시장|부시장|실장|국장|과장|단장|소장|읍장|면장|동장|팀장|전문위원|[1-9]급|지도관)$/.test(clean);
}

/**
 * 2~4글자 한글 성명 식별
 */
export function detectPerson(str) {
  const clean = str.replace(/\s+/g, "");
  return /^[가-힣]{2,4}$/.test(clean);
}

/**
 * 내선번호(4자리) 또는 전화번호 패턴 식별
 */
export function detectPhone(str) {
  const clean = str.replace(/\s+/g, "");
  return /^\d{4}$/.test(clean) || /^(031-\d{3,4}-\d{4})$/.test(clean);
}

/**
 * 추출된 엔티티의 신뢰도를 검증합니다.
 */
export function validateData(record) {
  let confidence = "HIGH";
  let needsReview = false;

  if (!record.name || !detectPerson(record.name)) {
    confidence = "LOW";
    needsReview = true;
  }
  if (!record.extension || !detectPhone(record.extension)) {
    confidence = "MEDIUM";
  }
  if (!record.department) {
    confidence = "LOW";
    needsReview = true;
  }

  return {
    ...record,
    confidence,
    needsReview
  };
}

/**
 * 파싱된 데이터를 웹앱 규격의 JSON으로 정규화합니다.
 */
export function normalizeData(parsedRows) {
  const result = {
    organization: {
      name: "남양주시",
      updatedAt: new Date().toISOString().slice(0, 10),
      source: "PDF 자동 파싱 데이터"
    },
    departments: []
  };

  // 파싱된 행 데이터를 순회하며 부서-팀-담당자 구조 복원
  return result;
}
