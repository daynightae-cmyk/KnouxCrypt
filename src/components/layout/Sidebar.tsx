import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LocalAIAssistant } from "../UI/LocalAIAssistant";
import { NeonButton2025 } from "../UI/NeonButton2025";
import { AboutDialog } from "../UI/AboutDialog";
import { StagEmblem } from "../entry/StagEmblem";

interface NavigationItem {
  path: string;
  icon: string;
  label: string;
  description: string;
  gradient: string;
  glowColor: string;
}

const navigationItems: NavigationItem[] = [
  {
    path: "/",
    icon: "🏠",
    label: "الرئيسية",
    description: "مركز التحكم الرئيسي",
    gradient: "from-blue-500 to-indigo-600",
    glowColor: "#6366F1",
  },
  {
    path: "/disk-manager",
    icon: "🛡️",
    label: "إدارة الأقراص",
    description: "تشفير متقدم للأقراص",
    gradient: "from-emerald-500 to-teal-600",
    glowColor: "#10B981",
  },
  {
    path: "/system-encryption",
    icon: "🌐",
    label: "تشفير النظام",
    description: "حماية شاملة للنظام",
    gradient: "from-amber-500 to-orange-600",
    glowColor: "#F59E0B",
  },
  {
    path: "/algorithms",
    icon: "🔬",
    label: "مختبر الخوارزميات",
    description: "4 خوارزميات متقدمة",
    gradient: "from-violet-500 to-purple-600",
    glowColor: "#8B5CF6",
  },
  {
    path: "/ai-assistant",
    icon: "🧠",
    label: "المساعد الذكي",
    description: "ذكاء اصطناعي متطور",
    gradient: "from-pink-500 to-rose-600",
    glowColor: "#EC4899",
  },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <motion.div
      className="sidebar relative overflow-hidden"
      initial={{ x: -300 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900/90 via-gray-800/95 to-gray-900/90 backdrop-blur-xl" />

      {/* Animated Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <motion.div
          className="w-full h-full"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.3) 0%, transparent 50%),
                             radial-gradient(circle at 80% 80%, rgba(168, 85, 247, 0.3) 0%, transparent 50%),
                             radial-gradient(circle at 40% 60%, rgba(34, 197, 94, 0.3) 0%, transparent 50%)`,
          }}
          animate={{
            backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </div>

      {/* Header */}
      <motion.div
        className="sidebar-header relative z-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="relative">
          {/* Logo Container */}
          <motion.div
            className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-white/10 backdrop-blur-sm"
            whileHover={{ scale: 1.02 }}
          >
            {/* Official emblem, kept upright: it used to rotate on a 20s loop
                inside an indigo gradient tile with a lock emoji on top. */}
            <motion.div
              className="relative"
              animate={{
                scale: [1, 1.05, 1],
              }}
              transition={{
                scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
              }}
            >
              <div className="w-12 h-12 shadow-lg">
                <StagEmblem />
              </div>
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl blur-lg opacity-30 -z-10" />
            </motion.div>
            <div>
              <motion.h1
                className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                KnouxCrypt™
              </motion.h1>
              <motion.span
                className="text-xs text-gray-400 font-medium"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                نظام التشفير 2025
              </motion.span>
            </div>
          </motion.div>

          {/* System Status */}
          <motion.div
            className="mt-4 p-3 rounded-xl bg-black/20 border border-green-500/30"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-2 h-2 bg-green-400 rounded-full"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-xs text-green-300 font-medium">
                  النظام آمن
                </span>
              </div>
              <span className="text-xs text-gray-400">
                {formatTime(currentTime)}
              </span>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Navigation */}
      <nav className="sidebar-nav relative z-10 mt-6">
        {navigationItems.map((item, index) => (
          <motion.div
            key={item.path}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.7 + index * 0.1 }}
          >
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                `nav-item group relative block ${isActive ? "active" : ""}`
              }
              onMouseEnter={() => setHoveredItem(item.path)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              {({ isActive }) => (
                <motion.div
                  className={`
                    relative flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 mb-2
                    ${
                      isActive
                        ? `bg-gradient-to-r ${item.gradient} shadow-lg`
                        : "hover:bg-white/10"
                    }
                  `}
                  whileHover={{ scale: 1.02, x: 8 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {/* Icon */}
                  <motion.div
                    className="relative text-2xl"
                    animate={
                      isActive
                        ? {
                            scale: [1, 1.2, 1],
                            rotate: [0, 10, -10, 0],
                          }
                        : {}
                    }
                    transition={{
                      duration: 2,
                      repeat: isActive ? Infinity : 0,
                    }}
                  >
                    {item.icon}
                    {/* Icon Glow */}
                    {isActive && (
                      <div
                        className="absolute inset-0 blur-lg opacity-60 -z-10"
                        style={{ color: item.glowColor }}
                      >
                        {item.icon}
                      </div>
                    )}
                  </motion.div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-semibold text-sm ${isActive ? "text-white" : "text-gray-300"}`}
                    >
                      {item.label}
                    </div>
                    <div
                      className={`text-xs ${isActive ? "text-white/80" : "text-gray-500"}`}
                    >
                      {item.description}
                    </div>
                  </div>

                  {/* Active Indicator */}
                  {isActive && (
                    <motion.div
                      className="absolute left-0 top-0 bottom-0 w-1 bg-white rounded-r-full"
                      layoutId="activeIndicator"
                      initial={false}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 30,
                      }}
                    />
                  )}

                  {/* Hover Effect */}
                  <AnimatePresence>
                    {hoveredItem === item.path && !isActive && (
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-white/5 to-white/10 rounded-2xl"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      />
                    )}
                  </AnimatePresence>

                  {/* Shimmer Effect */}
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-2xl"
                      animate={{ x: ["-100%", "100%"] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        repeatDelay: 3,
                        ease: "linear",
                      }}
                    />
                  )}
                </motion.div>
              )}
            </NavLink>
          </motion.div>
        ))}
      </nav>

      {/* Footer */}
      <motion.div
        className="sidebar-footer relative z-10 mt-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.2 }}
      >
        <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-white/10 backdrop-blur-sm">
          {/* System Stats */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">الأمان:</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-400"
                    initial={{ width: 0 }}
                    animate={{ width: "98%" }}
                    transition={{ duration: 2, delay: 1.5 }}
                  />
                </div>
                <span className="text-green-400 font-medium">98%</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">الخوارزميات:</span>
              <span className="text-purple-400 font-medium">4 نشطة</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">الحالة:</span>
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-2 h-2 bg-green-400 rounded-full"
                  animate={{
                    boxShadow: [
                      "0 0 5px rgba(34, 197, 94, 0.5)",
                      "0 0 20px rgba(34, 197, 94, 0.8)",
                      "0 0 5px rgba(34, 197, 94, 0.5)",
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-green-400 font-medium">متصل</span>
              </div>
            </div>

            {/* AI Assistant Button */}
            <div className="pt-3 border-t border-white/10 space-y-3">
              <NeonButton2025
                variant="quantum"
                size="sm"
                onClick={() => setIsAIAssistantOpen(true)}
                pulse
                className="w-full text-sm"
              >
                <span className="mr-2">🧠</span>
                المساعد الذكي
              </NeonButton2025>

              {/* About Button */}
              <motion.button
                className="w-full text-sm p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-all duration-300 flex items-center justify-center gap-2"
                onClick={() => setIsAboutDialogOpen(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span>ℹ️</span>
                حول البرنامج
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating Particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(10)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-blue-400/30 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.3, 1, 0.3],
              scale: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Local AI Assistant */}
      <LocalAIAssistant
        isOpen={isAIAssistantOpen}
        onClose={() => setIsAIAssistantOpen(false)}
      />

      {/* About Dialog */}
      <AboutDialog
        isVisible={isAboutDialogOpen}
        onClose={() => setIsAboutDialogOpen(false)}
      />
    </motion.div>
  );
};
