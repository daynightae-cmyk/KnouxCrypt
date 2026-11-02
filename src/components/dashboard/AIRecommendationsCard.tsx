import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import GlassCard from "../UI/GlassCard";
import NeonText from "../UI/NeonText";
import NeonButton from "../UI/NeonButton";
import ProgressRing from "../UI/ProgressRing";
import { useSecurity } from "../../context/SecurityContext";

interface AIRecommendationsCardProps {
  className?: string;
}

const AIRecommendationsCard: React.FC<AIRecommendationsCardProps> = ({
  className = "",
}) => {
  const {
    selectedDisk,
    aiRecommendations,
    isLoadingAI,
    aiAnalysisForDisk,
    encryptionPreferences,
    setEncryptionPreferences,
  } = useSecurity();

  const [isExpanded, setIsExpanded] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);

  // Handle AI analysis trigger
  const handleRunAnalysis = () => {
    if (selectedDisk) {
      aiAnalysisForDisk(selectedDisk);
    }
  };

  // Apply AI recommendations to user preferences
  const handleApplyRecommendations = () => {
    if (aiRecommendations && !aiRecommendations.error) {
      setEncryptionPreferences({
        algorithm: aiRecommendations.algorithm,
        useUsbKey: aiRecommendations.suggest_usb_key,
        hiddenVolume: aiRecommendations.suggest_hidden_volume,
        preferredAlgorithms: [
          aiRecommendations.algorithm,
          ...encryptionPreferences.preferredAlgorithms.filter(
            (a) => a !== aiRecommendations.algorithm,
          ),
        ],
      });
      setShowApplyModal(false);
    }
  };

  // Get security level color and icon
  const getSecurityLevelInfo = (confidenceScore: number) => {
    if (confidenceScore >= 0.8) {
      return {
        // "Military" was a certification the product does not have. The badge
        // ranks recommendation confidence, so it says that instead.
        level: "Maximum",
        color: "text-red-400",
        icon: "🛡️",
        bgColor: "bg-red-500/20",
      };
    } else if (confidenceScore >= 0.65) {
      return {
        level: "High",
        color: "text-yellow-400",
        icon: "🔒",
        bgColor: "bg-yellow-500/20",
      };
    } else {
      return {
        level: "Standard",
        color: "text-blue-400",
        icon: "🔐",
        bgColor: "bg-blue-500/20",
      };
    }
  };

  // Get algorithm info
  const getAlgorithmInfo = (algorithm: string) => {
    const algorithmData = {
      "AES-256": {
        description: "Advanced Encryption Standard - Fast and widely trusted",
        speed: "Fast",
        security: "High",
        icon: "⚡",
      },
      Serpent: {
        description: "High security cipher with conservative design",
        speed: "Medium",
        security: "Very High",
        icon: "🐍",
      },
      Twofish: {
        description: "Balanced cipher with good performance",
        speed: "Fast",
        security: "High",
        icon: "🐟",
      },
      "AES-Serpent-Twofish": {
        description: "Triple cascade encryption for maximum security",
        speed: "Slow",
        security: "Maximum",
        icon: "🔗",
      },
    };
    return (
      algorithmData[algorithm] || {
        description: "Unknown algorithm",
        speed: "Unknown",
        security: "Unknown",
        icon: "❓",
      }
    );
  };

  if (!selectedDisk) {
    return (
      <GlassCard className={`p-6 ${className}`}>
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-4">🤖</div>
          <NeonText size="normal">تحليل الذكاء الاصطناعي</NeonText>
          <p className="text-sm mt-2">اختر قرصاً لبدء التحليل</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`p-6 border-purple-500/30 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="text-2xl">🤖</div>
          <div>
            <NeonText size="normal" className="text-lg">
              AI Encryption Analysis
            </NeonText>
            <p className="text-gray-400 text-sm">For: {selectedDisk.caption}</p>
          </div>
        </div>
        <motion.button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-400 hover:text-white transition-colors"
          whileTap={{ scale: 0.95 }}
        >
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            ▼
          </motion.div>
        </motion.button>
      </div>

      {/* Loading State */}
      {isLoadingAI && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-8"
        >
          <ProgressRing
            progress={50}
            size={80}
            strokeWidth={6}
            color="#8B5CF6"
            className="mb-4"
          />
          <NeonText size="small" className="text-purple-300">
            Analyzing disk characteristics...
          </NeonText>
          <p className="text-gray-400 text-xs mt-2">
            This may take a few moments
          </p>
        </motion.div>
      )}

      {/* No Analysis State */}
      {!isLoadingAI && !aiRecommendations && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-8"
        >
          <div className="text-5xl mb-4 opacity-50">🔍</div>
          <NeonText size="small" className="mb-4">
            AI Analysis Available
          </NeonText>
          <p className="text-gray-400 text-sm mb-6">
            Get personalized encryption recommendations based on your disk
            characteristics and system configuration.
          </p>
          <NeonButton
            variant="primary"
            onClick={handleRunAnalysis}
            className="mx-auto"
          >
            <span className="flex items-center space-x-2">
              <span>🚀</span>
              <span>Run AI Analysis</span>
            </span>
          </NeonButton>
        </motion.div>
      )}

      {/* Error State */}
      {!isLoadingAI && aiRecommendations?.error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-8"
        >
          <div className="text-5xl mb-4 opacity-50">⚠️</div>
          <NeonText size="small" className="text-red-400 mb-4">
            Analysis Failed
          </NeonText>
          <p className="text-gray-400 text-sm mb-6">
            {aiRecommendations.error}
          </p>
          <NeonButton
            variant="secondary"
            onClick={handleRunAnalysis}
            className="mx-auto"
          >
            <span className="flex items-center space-x-2">
              <span>🔄</span>
              <span>Retry Analysis</span>
            </span>
          </NeonButton>
        </motion.div>
      )}

      {/* Recommendations Display */}
      {!isLoadingAI && aiRecommendations && !aiRecommendations.error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Confidence Score */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <ProgressRing
                progress={Math.round(aiRecommendations.confidence_score * 100)}
                size={50}
                strokeWidth={4}
                color="#10B981"
              />
              <div>
                <NeonText size="small" className="text-green-400">
                  {Math.round(aiRecommendations.confidence_score * 100)}%
                  Confidence
                </NeonText>
                <p className="text-gray-400 text-xs">
                  {
                    getSecurityLevelInfo(aiRecommendations.confidence_score)
                      .level
                  }{" "}
                  Security Level
                </p>
              </div>
            </div>
            <div
              className={`px-3 py-1 rounded-full ${getSecurityLevelInfo(aiRecommendations.confidence_score).bgColor}`}
            >
              <span className="text-sm">
                {getSecurityLevelInfo(aiRecommendations.confidence_score).icon}
                {getSecurityLevelInfo(aiRecommendations.confidence_score).level}
              </span>
            </div>
          </div>

          {/* Algorithm Recommendation */}
          <div className="glass-morphism p-4 rounded-lg border border-gray-700">
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-2xl">
                {getAlgorithmInfo(aiRecommendations.algorithm).icon}
              </span>
              <div>
                <NeonText size="small" className="text-blue-300">
                  Recommended Algorithm
                </NeonText>
                <p className="text-white font-medium">
                  {aiRecommendations.algorithm}
                </p>
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-3">
              {getAlgorithmInfo(aiRecommendations.algorithm).description}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-2 bg-gray-800/50 rounded">
                <p className="text-xs text-gray-400">Speed</p>
                <p className="text-sm text-white">
                  {getAlgorithmInfo(aiRecommendations.algorithm).speed}
                </p>
              </div>
              <div className="text-center p-2 bg-gray-800/50 rounded">
                <p className="text-xs text-gray-400">Security</p>
                <p className="text-sm text-white">
                  {getAlgorithmInfo(aiRecommendations.algorithm).security}
                </p>
              </div>
            </div>
          </div>

          {/* Password Strength */}
          <div className="glass-morphism p-4 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <NeonText size="small" className="text-yellow-300">
                Password Strength Score
              </NeonText>
              <span className="text-white font-bold text-lg">
                {aiRecommendations.password_strength_score}/100
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <motion.div
                className="bg-gradient-to-r from-yellow-500 to-green-500 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{
                  width: `${aiRecommendations.password_strength_score}%`,
                }}
                transition={{ duration: 1, delay: 0.5 }}
              />
            </div>
          </div>

          {/* Additional Recommendations */}
          <div className="space-y-3">
            {aiRecommendations.suggest_usb_key && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="flex items-center space-x-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg"
              >
                <span className="text-2xl">🔑</span>
                <div>
                  <p className="text-blue-300 font-medium">
                    USB Key Recommended
                  </p>
                  <p className="text-gray-400 text-sm">
                    Use an additional USB key for enhanced security
                  </p>
                </div>
              </motion.div>
            )}

            {aiRecommendations.suggest_hidden_volume && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-center space-x-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg"
              >
                <span className="text-2xl">👁️‍🗨️</span>
                <div>
                  <p className="text-purple-300 font-medium">
                    Hidden Volume Suggested
                  </p>
                  <p className="text-gray-400 text-sm">
                    Consider creating a hidden volume for additional privacy
                  </p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Explanation */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="glass-morphism p-4 rounded-lg border border-gray-700"
              >
                <NeonText size="small" className="text-gray-300 mb-2">
                  AI Explanation
                </NeonText>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {aiRecommendations.explanation}
                </p>
                {aiRecommendations.ai_run_time_ms && (
                  <p className="text-gray-500 text-xs mt-2">
                    Analysis completed in {aiRecommendations.ai_run_time_ms}ms
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <NeonButton
              variant="primary"
              onClick={() => setShowApplyModal(true)}
              className="flex-1"
            >
              <span className="flex items-center justify-center space-x-2">
                <span>✓</span>
                <span>Apply Recommendations</span>
              </span>
            </NeonButton>
            <NeonButton variant="secondary" onClick={handleRunAnalysis}>
              <span className="flex items-center space-x-2">
                <span>🔄</span>
                <span>Re-analyze</span>
              </span>
            </NeonButton>
          </div>
        </motion.div>
      )}

      {/* Apply Recommendations Modal */}
      <AnimatePresence>
        {showApplyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setShowApplyModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 border border-purple-500/30 rounded-lg p-6 max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="text-4xl mb-3">⚙️</div>
                <NeonText size="normal" className="text-lg mb-2">
                  Apply AI Recommendations?
                </NeonText>
                <p className="text-gray-400 text-sm">
                  This will update your encryption preferences with the
                  AI-recommended settings.
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded">
                  <span className="text-gray-300">Algorithm:</span>
                  <span className="text-white font-medium">
                    {aiRecommendations?.algorithm}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded">
                  <span className="text-gray-300">USB Key:</span>
                  <span className="text-white font-medium">
                    {aiRecommendations?.suggest_usb_key
                      ? "Enabled"
                      : "Disabled"}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded">
                  <span className="text-gray-300">Hidden Volume:</span>
                  <span className="text-white font-medium">
                    {aiRecommendations?.suggest_hidden_volume
                      ? "Enabled"
                      : "Disabled"}
                  </span>
                </div>
              </div>

              <div className="flex space-x-3">
                <NeonButton
                  variant="secondary"
                  onClick={() => setShowApplyModal(false)}
                  className="flex-1"
                >
                  Cancel
                </NeonButton>
                <NeonButton
                  variant="primary"
                  onClick={handleApplyRecommendations}
                  className="flex-1"
                >
                  Apply Settings
                </NeonButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
};

export default AIRecommendationsCard;
