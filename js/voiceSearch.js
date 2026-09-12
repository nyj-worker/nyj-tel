/**
 * 남양주시 스마트 조직도 - Voice Search Module
 * 브라우저 내장 Web Speech API(SpeechRecognition)를 활용한 한국어 음성 인식 모듈입니다.
 */

export class VoiceSearchEngine {
  constructor(options = {}) {
    this.recognition = null;
    this.isListening = false;
    this.onStart = options.onStart || (() => {});
    this.onResult = options.onResult || (() => {});
    this.onError = options.onError || (() => {});
    this.onEnd = options.onEnd || (() => {});

    this.init();
  }

  /**
   * 브라우저의 Web Speech API 지원 여부를 반환합니다.
   */
  static isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * 음성 인식 객체를 초기화합니다.
   */
  init() {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      console.warn("이 브라우저는 Web Speech API를 지원하지 않습니다.");
      return;
    }

    try {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.lang = "ko-KR"; // 한국어 설정
      this.recognition.continuous = false; // 한 문장/단어 인식 후 자동 종료
      this.recognition.interimResults = false; // 최종 결과만 확정

      this.recognition.onstart = () => {
        this.isListening = true;
        this.onStart();
      };

      this.recognition.onresult = (event) => {
        if (!event.results || event.results.length === 0) return;
        const transcript = event.results[0][0].transcript.trim();
        this.onResult(transcript);
      };

      this.recognition.onerror = (event) => {
        this.isListening = false;
        let message = "음성을 인식하지 못했습니다. 다시 시도해 주세요.";
        if (event.error === "not-allowed") {
          message = "마이크 사용 권한이 차단되었습니다. 브라우저 설정에서 마이크를 허용해 주세요.";
        } else if (event.error === "no-speech") {
          message = "음성이 감지되지 않았습니다. 마이크 가까이에서 다시 말씀해 주세요.";
        } else if (event.error === "network") {
          message = "음성 인식을 위한 네트워크 연결에 문제가 발생했습니다.";
        }
        this.onError(message, event.error);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.onEnd();
      };
    } catch (err) {
      console.error("음성 인식 엔진 초기화 실패:", err);
    }
  }

  /**
   * 음성 인식을 시작하거나 이미 실행 중이면 중지합니다 (토글).
   */
  toggle() {
    if (!VoiceSearchEngine.isSupported()) {
      this.onError("현재 브라우저는 음성 검색을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 이용해 주세요.");
      return;
    }

    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  /**
   * 음성 인식을 시작합니다.
   */
  start() {
    if (!this.recognition) {
      this.init();
    }
    if (!this.recognition) return;

    try {
      this.recognition.start();
    } catch (err) {
      console.warn("음성 인식 시작 실패 (이미 실행 중일 수 있음):", err);
    }
  }

  /**
   * 음성 인식을 중지합니다.
   */
  stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (err) {
        console.warn("음성 인식 중지 실패:", err);
      }
    }
    this.isListening = false;
  }
}
