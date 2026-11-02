/*
 * KnouxCrypt boot view controller.
 *
 * What this file deliberately does NOT do:
 *   - It no longer rotates invented status text on a timer. Every line it can
 *     show is a state the main process actually reached.
 *   - It no longer animates a progress bar. The boot window has no measurement
 *     to report, so a bar would be theatre.
 *   - It plays no audio. Sound is the renderer's job, together with the consent
 *     prompt and the user's stored preference (see Task D in splash.html).
 *
 * The eye ignition is CSS-only (splash.css), driven by the same aperture and
 * arrival shapes as stag.css. There is no second animation engine here, so
 * nothing in JavaScript has to keep the two in step.
 */

(function () {
  "use strict";

  // Bilingual, because the product is Arabic-first and the boot view is the one
  // screen every user sees before the language switch exists.
  var COPY = {
    opening: { en: "Opening KNOUX CRYPT", ar: "جارٍ فتح KnouxCrypt" },
    retrying: { en: "Restarting the interface", ar: "جارٍ إعادة تشغيل الواجهة" },
    interface_ready: { en: "Ready", ar: "جاهز" },
    failed: { en: "The interface did not start", ar: "لم يتم تشغيل الواجهة" },
  };

  var stage = document.querySelector(".boot-stage");
  var stateEn = document.getElementById("bootStateEn");
  var stateAr = document.getElementById("bootStateAr");
  var stateLine = document.getElementById("bootState");
  var versionLine = document.getElementById("bootVersion");
  var recovery = document.getElementById("bootRecovery");
  var recoveryDetail = document.getElementById("bootRecoveryDetail");
  var retryButton = document.getElementById("bootRetry");
  var quitButton = document.getElementById("bootQuit");

  function setState(state) {
    var copy = COPY[state.state];
    if (!copy || !stateEn || !stateAr) return;
    stateEn.textContent = copy.en;
    stateAr.textContent = copy.ar;
    if (stateLine) stateLine.setAttribute("data-boot-state", state.state);
    if (versionLine) {
      versionLine.textContent = state.version ? "Version " + state.version : "";
    }
    if (state.state === "failed") showRecovery(state.detail);
    else if (recovery) recovery.hidden = true;
  }

  function showRecovery(detail) {
    if (!recovery || !stage) return;
    // Stop the ignition rather than hiding a running animation behind a panel:
    // a stuck-in-place half-open eye reads as a second fault.
    stage.setAttribute("data-boot-phase", "failed");
    recoveryDetail.textContent = detail || "The main window reported no reason.";
    recovery.hidden = false;
    if (retryButton) retryButton.focus();
  }

  var bridge = window.knouxCryptBoot;
  if (bridge && typeof bridge.onState === "function") {
    bridge.onState(setState);
    if (typeof bridge.retry === "function" && retryButton) {
      retryButton.addEventListener("click", function () { bridge.retry(); });
    }
    if (typeof bridge.quit === "function" && quitButton) {
      quitButton.addEventListener("click", function () { bridge.quit(); });
    }
  }
  // Without the bridge this document is being opened directly (a browser or a
  // screenshot harness), so it stays on the truthful opening line it already
  // shows in the markup and never claims a state it was not told about.
})();
