// نصوص التحميل المتحركة
const loadingTexts = [
  "جاري تحميل النظام...",
  "تهيئة خوارزميات التشفير...",
  "فحص الأمان...",
  "تحميل الواجهة...",
  "تطبيق الإعدادات...",
  "النظام جاهز!",
];

let currentTextIndex = 0;
const loadingTextElement = document.getElementById("loadingText");

function updateLoadingText() {
  loadingTextElement.style.opacity = "0";

  setTimeout(() => {
    loadingTextElement.textContent = loadingTexts[currentTextIndex];
    loadingTextElement.style.opacity = "1";
    currentTextIndex = (currentTextIndex + 1) % loadingTexts.length;
  }, 200);
}

// تحديث النص كل 500 مللي ثانية
setInterval(updateLoadingText, 500);

// إضافة تأثيرات صوتية (اختيارية)
window.addEventListener("load", () => {
  console.log("🔐 KnouxCrypt™ 2025 - Splash screen loaded");

  // إضافة المزيد من الجزيئات ديناميكياً
  const particlesContainer = document.querySelector(".particles");
  for (let i = 6; i <= 10; i++) {
    const particle = document.createElement("div");
    particle.className = "particle";
    particle.style.top = Math.random() * 100 + "%";
    particle.style.left = Math.random() * 100 + "%";
    particle.style.animationDelay = Math.random() * 6 + "s";
    particlesContainer.appendChild(particle);
  }
});
