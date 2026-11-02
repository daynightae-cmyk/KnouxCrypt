import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { StagEmblem } from "../entry/StagEmblem";

interface QuickActionCard {
  title: string;
  description: string;
  subtitle: string;
  icon: string;
  path: string;
  color: string;
  gradient: string;
  status: "active" | "idle" | "processing";
  stats?: {
    label: string;
    value: string;
  };
}

interface SecurityMetric {
  id: string;
  label: string;
  value: number;
  maxValue: number;
  color: string;
  icon: string;
  trend: "up" | "down" | "stable";
  status: "excellent" | "good" | "warning" | "critical";
}

const quickActions: QuickActionCard[] = [
  {
    title: "مختبر الخوارزميات",
    description: "اختبر أقوى خوارزميات التشفير",
    subtitle: "4 خوارزميات متقدمة",
    icon: "🔬",
    path: "/algorithms",
    color: "#6366F1",
    gradient: "from-indigo-500 to-purple-600",
    status: "active",
    stats: { label: "خوارزميات", value: "4" },
  },
  {
    title: "إدارة الأقراص الذكية",
    description: "تشفير متقدم للأقراص والـ USB",
    subtitle: "حماية عسكرية",
    icon: "🛡️",
    path: "/disk-manager",
    color: "#10B981",
    gradient: "from-emerald-500 to-teal-600",
    status: "active",
    stats: { label: "أقراص", value: "5" },
  },
  {
    title: "تشفير النظام الكامل",
    description: "حماية شاملة للقرص الصلب",
    subtitle: "مقاوم كمي",
    icon: "🌐",
    path: "/system-encryption",
    color: "#F59E0B",
    gradient: "from-amber-500 to-orange-600",
    status: "idle",
    stats: { label: "حماية", value: "98%" },
  },
  {
    title: "المساعد الذكي AI",
    description: "توصيات ذكية للأمان",
    subtitle: "مدعوم بالذكاء الاصطناعي",
    icon: "🧠",
    path: "/ai-assistant",
    color: "#8B5CF6",
    gradient: "from-violet-500 to-purple-600",
    status: "active",
    stats: { label: "توصيات", value: "12" },
  },
];

const securityMetrics: SecurityMetric[] = [
  {
    id: "encryption",
    label: "قوة التشفير",
    value: 98,
    maxValue: 100,
    color: "#10B981",
    icon: "🔐",
    trend: "up",
    status: "excellent",
  },
  {
    id: "quantum-resistance",
    label: "مقاومة الكمبيوتر الكمي",
    value: 95,
    maxValue: 100,
    color: "#6366F1",
    icon: "⚛️",
    trend: "stable",
    status: "excellent",
  },
  {
    id: "performance",
    label: "أداء النظام",
    value: 87,
    maxValue: 100,
    color: "#F59E0B",
    icon: "⚡",
    trend: "up",
    status: "good",
  },
  {
    id: "threat-detection",
    label: "كشف التهديدات",
    value: 92,
    maxValue: 100,
    color: "#EF4444",
    icon: "🎯",
    trend: "up",
    status: "excellent",
  },
];

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const loadTimer = setTimeout(() => setIsLoading(false), 1500);
    return () => {
      clearInterval(timer);
      clearTimeout(loadTimer);
    };
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleString("ar-SA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <motion.div
          className="flex items-center justify-center min-h-[60vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="text-center">
            {/* The emblem used to spin 360° forever as a loading spinner. A logo
                is not a spinner: the stag keeps its upright pose and only pulses. */}
            <motion.div
              className="inline-block w-16 h-16 mb-4"
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              <StagEmblem />
            </motion.div>
            <motion.h2
              className="text-2xl font-bold mb-2 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              تحميل نظام KnouxCrypt™
            </motion.h2>
            <motion.p
              className="text-gray-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              جاري تهيئة النظام المتقدم...
            </motion.p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header Section */}
      <motion.div
        className="relative overflow-hidden rounded-3xl mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-purple-600/20 to-pink-600/20 backdrop-blur-sm" />
        <div className="relative p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6 space-x-reverse">
              <motion.div
                className="text-6xl"
                animate={{
                  rotate: [0, 10, -10, 0],
                  scale: [1, 1.05, 1],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                🛡️
              </motion.div>
              <div>
                <motion.h1
                  className="text-4xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent mb-2"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  مرحباً بك في KnouxCrypt™ 2025
                </motion.h1>
                <motion.p
                  className="text-xl text-gray-300 mb-1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  مجموعة التشفير الخاصة
                </motion.p>
                <motion.p
                  className="text-sm text-gray-400"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  {formatTime(currentTime)}
                </motion.p>
              </div>
            </div>
            <motion.div
              className="text-right"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 }}
            >
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-green-500/20 border border-green-500/30 text-green-300 text-sm font-medium mb-2">
                <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
                نظام محمي بالكامل
              </div>
              <div className="text-sm text-gray-400">مستوى الأمان: عسكري</div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Security Metrics Dashboard */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        {securityMetrics.map((metric, index) => (
          <motion.div
            key={metric.id}
            className={`relative overflow-hidden rounded-2xl p-6 backdrop-blur-md border transition-all duration-500 cursor-pointer group ${
              activeMetric === metric.id
                ? "scale-105 shadow-2xl"
                : "hover:scale-102 hover:shadow-xl"
            }`}
            style={{
              background: `linear-gradient(135deg, ${metric.color}15, ${metric.color}05)`,
              borderColor: `${metric.color}30`,
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * index }}
            onHoverStart={() => setActiveMetric(metric.id)}
            onHoverEnd={() => setActiveMetric(null)}
            whileHover={{ y: -5 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-3xl group-hover:scale-110 transition-transform duration-300">
                {metric.icon}
              </div>
              <div
                className={`px-2 py-1 rounded-full text-xs font-bold ${metric.status === "excellent" ? "bg-green-500/20 text-green-300" : metric.status === "good" ? "bg-blue-500/20 text-blue-300" : "bg-yellow-500/20 text-yellow-300"}`}
              >
                {metric.status === "excellent"
                  ? "ممتاز"
                  : metric.status === "good"
                    ? "جيد"
                    : "مقبول"}
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white mb-2">
                {metric.label}
              </h3>
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-2xl font-bold"
                  style={{ color: metric.color }}
                >
                  {metric.value}%
                </span>
                <div
                  className={`text-sm ${
                    metric.trend === "up"
                      ? "text-green-400"
                      : metric.trend === "down"
                        ? "text-red-400"
                        : "text-gray-400"
                  }`}
                >
                  {metric.trend === "up"
                    ? "↗️"
                    : metric.trend === "down"
                      ? "↘️"
                      : "➡️"}
                </div>
              </div>

              <div className="w-full bg-gray-700/50 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${metric.color}, ${metric.color}aa)`,
                  }}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(metric.value / metric.maxValue) * 100}%`,
                  }}
                  transition={{ duration: 1.5, delay: 0.5 + index * 0.1 }}
                />
              </div>
            </div>

            <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
          </motion.div>
        ))}
      </motion.div>

      {/* Advanced Quick Actions */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6 }}
      >
        <motion.h2
          className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          🏠 مركز التحكم المتقدم
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {quickActions.map((action, index) => (
            <motion.div
              key={action.path}
              className="group relative overflow-hidden rounded-3xl backdrop-blur-md border border-white/10 transition-all duration-500 cursor-pointer"
              style={{
                background: `linear-gradient(135deg, ${action.color}20, ${action.color}10, transparent)`,
              }}
              initial={{ opacity: 0, y: 30, rotateX: 45 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.8 + index * 0.1,
                type: "spring",
                stiffness: 100,
              }}
              whileHover={{
                scale: 1.05,
                y: -10,
                transition: { duration: 0.3 },
              }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(action.path)}
            >
              {/* Status Indicator */}
              <div className="absolute top-4 left-4">
                <div
                  className={`w-3 h-3 rounded-full ${
                    action.status === "active"
                      ? "bg-green-400 shadow-lg shadow-green-400/50 animate-pulse"
                      : action.status === "processing"
                        ? "bg-yellow-400 shadow-lg shadow-yellow-400/50 animate-pulse"
                        : "bg-gray-400 shadow-lg shadow-gray-400/50"
                  }`}
                />
              </div>

              {/* Stats Badge */}
              {action.stats && (
                <div className="absolute top-4 right-4 px-2 py-1 rounded-full bg-black/30 backdrop-blur-sm text-xs font-bold text-white">
                  {action.stats.value}
                </div>
              )}

              <div className="p-6">
                {/* Icon */}
                <motion.div
                  className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300"
                  style={{
                    filter: "drop-shadow(0 0 20px rgba(255,255,255,0.3))",
                  }}
                >
                  {action.icon}
                </motion.div>

                {/* Content */}
                <div className="space-y-2 mb-6">
                  <h3 className="text-xl font-bold text-white group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-300 group-hover:bg-clip-text transition-all duration-300">
                    {action.title}
                  </h3>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {action.description}
                  </p>
                  <p className="text-xs text-gray-400 font-medium">
                    {action.subtitle}
                  </p>
                </div>

                {/* Action Button */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-400">
                    {action.stats?.label}
                  </span>
                  <motion.div
                    className="flex items-center text-white group-hover:text-blue-300 transition-colors duration-300"
                    whileHover={{ x: 5 }}
                  >
                    <span className="text-sm font-medium ml-2">الدخول</span>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </motion.div>
                </div>
              </div>

              {/* Hover Effect */}
              <motion.div
                className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-20 transition-opacity duration-500`}
              />

              {/* Shimmer Effect */}
              <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Advanced System Overview */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.9 }}
      >
        {/* System Status Card */}
        <motion.div
          className="relative overflow-hidden rounded-3xl backdrop-blur-md border border-white/10 p-8"
          style={{
            background:
              "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15), rgba(236, 72, 153, 0.15))",
          }}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.3 }}
        >
          <motion.h3
            className="text-2xl font-bold mb-6 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.0 }}
          >
            🔍 مراقبة النظام المتقدمة
          </motion.h3>

          <div className="grid grid-cols-2 gap-6">
            {[
              {
                icon: "💿",
                label: "أقراص مكتشفة",
                value: "5",
                color: "#6366F1",
              },
              {
                icon: "🔐",
                label: "أقراص مشفرة",
                value: "3",
                color: "#10B981",
              },
              { icon: "🧠", label: "مساعد AI", value: "نشط", color: "#8B5CF6" },
              {
                icon: "⚡",
                label: "خوارزمية رئيسية",
                value: "AES-256",
                color: "#F59E0B",
              },
            ].map((stat, idx) => (
              <motion.div
                key={stat.label}
                className="text-center p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 + idx * 0.1 }}
                whileHover={{ y: -5, scale: 1.05 }}
              >
                <div
                  className="text-3xl mb-2"
                  style={{
                    filter: "drop-shadow(0 0 10px rgba(255,255,255,0.3))",
                  }}
                >
                  {stat.icon}
                </div>
                <div
                  className="text-2xl font-bold mb-1"
                  style={{ color: stat.color }}
                >
                  {stat.value}
                </div>
                <div className="text-sm text-gray-400">{stat.label}</div>
              </motion.div>
            ))}
          </div>

          <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-1000" />
        </motion.div>

        {/* Real-time Activity Feed */}
        <motion.div
          className="relative overflow-hidden rounded-3xl backdrop-blur-md border border-white/10 p-8"
          style={{
            background:
              "linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(59, 130, 246, 0.15))",
          }}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.3 }}
        >
          <motion.h3
            className="text-2xl font-bold mb-6 bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.0 }}
          >
            📊 نشاط فوري للنظام
          </motion.h3>

          <div className="space-y-4">
            {[
              {
                time: "قبل دقيقتين",
                action: "تم تشفير قرص USB بنجاح",
                status: "success",
                icon: "✓",
              },
              {
                time: "قبل 5 دقائق",
                action: "فحص أمان تلقائي للنظام",
                status: "info",
                icon: "🔍",
              },
              {
                time: "قبل 10 دقائق",
                action: "تحديث قواعد كشف التهديدات",
                status: "warning",
                icon: "⚠️",
              },
              {
                time: "قبل 15 دقيقة",
                action: "AI يقترح تحسينات أمنية",
                status: "info",
                icon: "🧠",
              },
            ].map((activity, idx) => (
              <motion.div
                key={idx}
                className="flex items-center space-x-4 space-x-reverse p-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all duration-300"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.2 + idx * 0.1 }}
                whileHover={{ x: -5 }}
              >
                <div
                  className={`text-xl p-2 rounded-full ${
                    activity.status === "success"
                      ? "bg-green-500/20 text-green-300"
                      : activity.status === "warning"
                        ? "bg-yellow-500/20 text-yellow-300"
                        : "bg-blue-500/20 text-blue-300"
                  }`}
                >
                  {activity.icon}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">
                    {activity.action}
                  </div>
                  <div className="text-xs text-gray-400">{activity.time}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Call to Action */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.3 }}
      >
        <motion.div
          className="inline-flex items-center px-8 py-4 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg shadow-2xl hover:shadow-indigo-500/25 transition-all duration-300 cursor-pointer"
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate("/algorithms")}
        >
          🚀 استكشف قوة الخوارزميات المتقدمة
        </motion.div>
      </motion.div>
    </div>
  );
};
