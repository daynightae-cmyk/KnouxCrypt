import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";

// Enhanced interfaces for comprehensive disk management and AI integration
export interface SystemInfo {
  platform: string;
  release: string;
  arch: string;
  totalMemory: number;
  freeMemory: number;
  cpus: any[];
  uefiSecureBoot: boolean;
  drives: DiskInfo[];
  veracryptInstalled: boolean;
  timestamp: number;
}

export interface DiskInfo {
  caption: string;
  volumeName?: string;
  fileSystem?: string;
  size: number; // Bytes
  freeSpace: number; // Bytes
  driveType: number; // Windows Disk Type (2=Fixed, 3=Network, 7=Removable, etc.)
  mounted: boolean;
  mountLetter?: string; // If mounted, what drive letter?
  encryptionStatus:
    | "unencrypted"
    | "encrypted"
    | "preparing"
    | "processing"
    | "unknown";
  description?: string;
  deviceID?: string;
  mediaType?: string;
}

export interface AICalculatedParams {
  algorithm: string;
  password_strength_score: number;
  suggest_usb_key: boolean;
  suggest_hidden_volume: boolean;
  explanation: string;
  confidence_score: number;
  security_focus_factor?: number;
  ai_run_time_ms?: number;
  error?: string;
}

export interface EncryptionSettings {
  algorithm: string;
  useUsbKey: boolean;
  usbKeyPath?: string;
  hiddenVolume: boolean;
  preferredAlgorithms: string[];
  quickFormat?: boolean;
  filesystem?: string;
}

export interface OperationState {
  isRunning: boolean;
  progress: number;
  status: string;
  message: string;
  operationType: "none" | "encryption" | "decryption" | "mount" | "unmount";
  targetDisk?: string;
  startTime?: Date;
  estimatedTimeRemaining?: number;
}

// Enhanced Context Type with comprehensive functionality
interface SecurityContextType {
  // Authentication (preserved from original)
  user: any | null;
  isAuthenticated: boolean;
  login?: (credentials: any) => Promise<boolean>;
  logout?: () => void;

  // System Info
  systemInfo: SystemInfo | null;
  loadSystemInfo: () => Promise<void>;

  // Disk Management
  disks: DiskInfo[];
  selectedDisk: DiskInfo | null;
  setSelectedDisk: (disk: DiskInfo | null) => void;
  refreshDisks: () => Promise<void>;
  mountedVolumes: { [driveLetter: string]: DiskInfo["caption"] };

  // Operation States
  encryptionState: OperationState;
  decryptionState: OperationState;
  mountState: OperationState;

  // AI State
  aiRecommendations: AICalculatedParams | null;
  isLoadingAI: boolean;

  // User Preferences
  encryptionPreferences: EncryptionSettings;
  setEncryptionPreferences: (prefs: Partial<EncryptionSettings>) => void;

  // Core Methods
  startEncryption: (
    disk: DiskInfo,
    password: string,
    settings?: Partial<EncryptionSettings>,
  ) => Promise<void>;
  startDecryption: (disk: DiskInfo, password: string) => Promise<void>;
  mountVolume: (
    disk: DiskInfo,
    password: string,
    driveLetter?: string,
  ) => Promise<void>;
  unmountVolume: (disk: DiskInfo) => Promise<void>;
  aiAnalysisForDisk: (disk: DiskInfo) => Promise<void>;

  // Legacy methods for compatibility
  scanDisks?: () => Promise<void>;
  getAIRecommendations?: (disk: DiskInfo) => Promise<void>;
  updateOperationState?: (
    type: OperationState["operationType"],
    stateUpdate: Partial<OperationState>,
  ) => void;
}

// Create Context
const SecurityContext = createContext<SecurityContextType | undefined>(
  undefined,
);

// Provider Component with enhanced functionality
export const SecurityProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Authentication states (basic implementation)
  const [user, setUser] = useState<any | null>(null);

  // System and disk states
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [selectedDisk, setSelectedDisk] = useState<DiskInfo | null>(null);
  const [mountedVolumes, setMountedVolumes] = useState<{
    [driveLetter: string]: DiskInfo["caption"];
  }>({});

  // AI states
  const [aiRecommendations, setAIRecommendations] =
    useState<AICalculatedParams | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  // Operation states initialization
  const initialOperationState: OperationState = {
    isRunning: false,
    progress: 0,
    status: "Idle",
    message: "",
    operationType: "none",
  };

  const [encryptionState, setEncryptionState] = useState<OperationState>(
    initialOperationState,
  );
  const [decryptionState, setDecryptionState] = useState<OperationState>(
    initialOperationState,
  );
  const [mountState, setMountState] = useState<OperationState>(
    initialOperationState,
  );

  // User preferences
  const [encryptionPreferences, setEncryptionPreferences] =
    useState<EncryptionSettings>({
      algorithm: "AES-256",
      preferredAlgorithms: ["AES-256", "Serpent", "AES-Serpent-Twofish"],
      useUsbKey: false,
      hiddenVolume: false,
      usbKeyPath: "",
      quickFormat: true,
      filesystem: "NTFS",
    });

  const isAuthenticated = user !== null;

  // Helper to update specific operation state
  const updateOperationState = useCallback(
    (
      type: OperationState["operationType"],
      stateUpdate: Partial<OperationState>,
    ) => {
      let setter;
      switch (type) {
        case "encryption":
          setter = setEncryptionState;
          break;
        case "decryption":
          setter = setDecryptionState;
          break;
        case "mount":
        case "unmount":
          setter = setMountState;
          break;
        default:
          return;
      }
      setter((prevState) => {
        const newState = { ...prevState, ...stateUpdate };
        if (
          stateUpdate.status &&
          ["Completed", "Failed", "Mounted", "Unmounted"].includes(
            stateUpdate.status,
          )
        ) {
          newState.isRunning = false;
        }
        if (type !== "none" && newState.operationType === "none")
          newState.operationType = type;
        return newState;
      });
    },
    [],
  );

  // Basic authentication methods
  const login = async (credentials: any): Promise<boolean> => {
    try {
      // Mock authentication - replace with actual implementation
      if (
        credentials.username === "admin" &&
        credentials.password === "admin"
      ) {
        setUser({ id: "1", username: "admin", role: "admin" });
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login failed:", error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    // Clear sensitive data on logout
    setSelectedDisk(null);
    setAIRecommendations(null);
    setMountedVolumes({});
  };

  // Load system information
  const loadSystemInfo = async () => {
    try {
      if (window.electronAPI?.legacy?.isSupported) {
        const info = await window.electronAPI.legacy.invoke("get-system-info");
        setSystemInfo(info);
        if (info?.drives) {
          setDisks(info.drives);
        }
      } else {
        // No disk/volume provider exists in this build. Report nothing rather
        // than fabricating drive letters and encryption statuses.
        setSystemInfo(null);
        setDisks([]);
      }
    } catch (error) {
      console.error("Failed to load system info:", error);
    }
  };

  // Method to fetch and refresh disk list and their statuses
  const refreshDisks = useCallback(async () => {
    console.log("Context: Refreshing disks...");
    try {
      if (window.electronAPI?.legacy?.isSupported) {
        const systemData = await window.electronAPI.legacy.invoke("get-system-info");
        const fetchedDisks: DiskInfo[] = systemData?.drives || [];

        // Update disk statuses: Check mounted status for each disk
        const currentMountedLetters = Object.keys(mountedVolumes);
        const updatedDisks = fetchedDisks.map((disk) => {
          const isMounted = currentMountedLetters.some(
            (letter) => mountedVolumes[letter] === disk.caption,
          );
          let encryptionStatus: DiskInfo["encryptionStatus"] = "unknown";

          if (isMounted) {
            disk.mounted = true;
            disk.mountLetter = currentMountedLetters.find(
              (letter) => mountedVolumes[letter] === disk.caption,
            );
            encryptionStatus = "encrypted"; // Assume mounted is encrypted
          } else {
            disk.mounted = false;
            disk.mountLetter = undefined;
          }

          disk.encryptionStatus = encryptionStatus || "unencrypted";
          return disk;
        });

        setDisks(updatedDisks);
        if (systemData) {
          setSystemInfo(systemData);
        }
      } else {
        // Use existing disks for development
        console.log("Development mode: Using existing disk data");
      }
    } catch (error) {
      console.error("Failed to refresh disks:", error);
    }
  }, [mountedVolumes]);

  // AI analysis initiator
  const aiAnalysisForDisk = async (disk: DiskInfo) => {
    if (!disk || isLoadingAI) return;
    setIsLoadingAI(true);
    setAIRecommendations(null);
    try {
      if (window.electronAPI?.legacy?.isSupported) {
        await window.electronAPI.legacy.invoke("run-ai-analysis", disk);
      } else {
        // Mock AI analysis for development
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const mockRecommendations: AICalculatedParams = {
          algorithm: disk.caption === "C:" ? "AES-Serpent-Twofish" : "AES-256",
          password_strength_score: disk.caption === "C:" ? 95 : 80,
          suggest_usb_key: disk.caption === "C:",
          suggest_hidden_volume: disk.size > 500 * 1024 * 1024 * 1024,
          explanation:
            disk.caption === "C:"
              ? "System disk requires maximum security. Triple encryption recommended."
              : "Balanced security approach suitable for data storage.",
          confidence_score: 0.85,
          ai_run_time_ms: 2000,
        };
        setAIRecommendations(mockRecommendations);
        setIsLoadingAI(false);
      }
    } catch (error) {
      console.error("Error initiating AI analysis:", error);
      setIsLoadingAI(false);
      setAIRecommendations({
        error: "Failed to initiate AI analysis.",
        algorithm: "Error",
        password_strength_score: 0,
        suggest_usb_key: false,
        suggest_hidden_volume: false,
        explanation: "AI analysis could not be completed.",
        confidence_score: 0,
      });
    }
  };

  // Core encryption operations
  const startEncryption = async (
    disk: DiskInfo,
    password: string,
    settings: Partial<EncryptionSettings> = {},
  ) => {
    if (!disk || encryptionState.isRunning || !password) return;
    const finalSettings = { ...encryptionPreferences, ...settings };

    updateOperationState("encryption", {
      isRunning: true,
      status: "Preparing",
      progress: 0,
      message: `Initializing encryption for ${disk.caption}`,
      targetDisk: disk.caption,
      startTime: new Date(),
    });

    try {
      if (window.electronAPI?.legacy?.isSupported) {
        await window.electronAPI.legacy.invoke("encrypt-drive", {
          disk: { caption: disk.caption },
          password: password,
          algorithm: finalSettings.algorithm,
          useUsbKey: finalSettings.useUsbKey,
          usbKeyPath: finalSettings.usbKeyPath,
          hiddenVolume: finalSettings.hiddenVolume,
          filesystem: finalSettings.filesystem,
          quickFormat: finalSettings.quickFormat,
        });
      } else {
        // Mock encryption process for development
        const phases = [
          { progress: 10, message: "Checking disk integrity..." },
          { progress: 25, message: "Creating encryption keys..." },
          { progress: 50, message: "Starting encryption..." },
          { progress: 75, message: "Encrypting data..." },
          { progress: 100, message: "Encryption completed!" },
        ];

        for (const phase of phases) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          updateOperationState("encryption", {
            status: "Encrypting",
            message: phase.message,
            progress: phase.progress,
          });
        }

        setDisks((prev) =>
          prev.map((d) =>
            d.caption === disk.caption
              ? { ...d, encryptionStatus: "encrypted" }
              : d,
          ),
        );

        updateOperationState("encryption", {
          status: "Completed",
          message: "Disk encrypted successfully",
          progress: 100,
        });
      }
    } catch (error: any) {
      updateOperationState("encryption", {
        isRunning: false,
        status: "Failed",
        message: `Operation initiation failed: ${error.message}`,
        targetDisk: disk.caption,
      });
    }
  };

  const startDecryption = async (disk: DiskInfo, password: string) => {
    if (!disk || decryptionState.isRunning || !password) return;

    updateOperationState("decryption", {
      isRunning: true,
      status: "Preparing",
      progress: 0,
      message: `Initializing decryption for ${disk.caption}`,
      targetDisk: disk.caption,
      startTime: new Date(),
    });

    try {
      if (window.electronAPI?.legacy?.isSupported) {
        await window.electronAPI.legacy.invoke("decrypt-drive", {
          disk: { caption: disk.caption },
          password: password,
        });
      } else {
        // Mock decryption for development
        await new Promise((resolve) => setTimeout(resolve, 3000));
        updateOperationState("decryption", {
          status: "Completed",
          message: "Decryption completed successfully",
          progress: 100,
        });
      }
    } catch (error: any) {
      updateOperationState("decryption", {
        isRunning: false,
        status: "Failed",
        message: `Decryption initiation failed: ${error.message}`,
        targetDisk: disk.caption,
      });
    }
  };

  const mountVolume = async (
    disk: DiskInfo,
    password: string,
    driveLetter?: string,
  ) => {
    if (!disk || mountState.isRunning || !password) return;

    updateOperationState("mount", {
      isRunning: true,
      status: "Mounting",
      progress: 0,
      message: `Mounting ${disk.caption}`,
      targetDisk: disk.caption,
    });

    try {
      if (window.electronAPI?.legacy?.isSupported) {
        await window.electronAPI.legacy.invoke("mount-volume", {
          disk: { caption: disk.caption },
          password: password,
          driveLetter: driveLetter,
        });
      } else {
        // Mock mounting for development
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const assignedLetter =
          driveLetter ||
          `${String.fromCharCode(70 + Math.floor(Math.random() * 10))}:`;
        setMountedVolumes((prev) => ({
          ...prev,
          [assignedLetter]: disk.caption,
        }));

        updateOperationState("mount", {
          status: "Mounted",
          message: `Volume mounted to ${assignedLetter}`,
          progress: 100,
        });
      }
    } catch (error: any) {
      updateOperationState("mount", {
        isRunning: false,
        status: "Failed",
        message: `Mount failed: ${error.message}`,
        targetDisk: disk.caption,
      });
    }
  };

  const unmountVolume = async (disk: DiskInfo) => {
    if (!disk || mountState.isRunning) return;

    updateOperationState("unmount", {
      isRunning: true,
      status: "Unmounting",
      progress: 0,
      message: `Unmounting ${disk.caption}`,
      targetDisk: disk.caption,
    });

    try {
      if (window.electronAPI?.legacy?.isSupported) {
        await window.electronAPI.legacy.invoke("unmount-volume", {
          disk: { caption: disk.caption, mountLetter: disk.mountLetter },
        });
      } else {
        // Mock unmounting for development
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const mountedLetter = Object.keys(mountedVolumes).find(
          (letter) => mountedVolumes[letter] === disk.caption,
        );
        if (mountedLetter) {
          setMountedVolumes((prev) => {
            const newMounted = { ...prev };
            delete newMounted[mountedLetter];
            return newMounted;
          });
        }

        updateOperationState("unmount", {
          status: "Unmounted",
          message: "Volume unmounted successfully",
          progress: 100,
        });
      }
    } catch (error: any) {
      updateOperationState("unmount", {
        isRunning: false,
        status: "Failed",
        message: `Unmount failed: ${error.message}`,
        targetDisk: disk.caption,
      });
    }
  };

  const setEncryptionPreferencesFunc = (prefs: Partial<EncryptionSettings>) => {
    setEncryptionPreferences((prev) => ({ ...prev, ...prefs }));
  };

  // IPC event listeners for real-time updates
  useEffect(() => {
    if (!window.electronAPI?.legacy?.isSupported) return;

    const handleOperationProgress = (event: any, data: any) => {
      if (data.type === "encryption") updateOperationState("encryption", data);
      else if (data.type === "decryption")
        updateOperationState("decryption", data);
      else if (data.type === "mount" || data.type === "unmount") {
        updateOperationState("mount", data);
        // Update mountedVolumes based on mount/unmount results
        if (data.status === "Mounted" && data.targetDisk && data.mountLetter) {
          setMountedVolumes((prev) => ({
            ...prev,
            [data.mountLetter]: data.targetDisk,
          }));
        } else if (data.status === "Unmounted" && data.targetDisk) {
          setMountedVolumes((prev) => {
            const newMounted = { ...prev };
            for (const letter in newMounted) {
              if (newMounted[letter] === data.targetDisk) {
                delete newMounted[letter];
                break;
              }
            }
            return newMounted;
          });
        }
      }
    };

    const handleAIResult = (event: any, result: any) => {
      setIsLoadingAI(false);
      if (result.success) {
        setAIRecommendations(result.data);
      } else {
        console.error("AI Analysis Failed:", result.error);
        setAIRecommendations({
          error: result.error,
          algorithm: "Error",
          password_strength_score: 0,
          suggest_usb_key: false,
          suggest_hidden_volume: false,
          explanation: "AI analysis failed.",
          confidence_score: 0,
        });
      }
    };

    const handleDiskStatusUpdate = (event: any, disksData: DiskInfo[]) => {
      setDisks(disksData);
    };

    const handleToolStatus = (event: any, data: any) => {
      console.log("Tool status update:", data);
    };

    const handleOperationComplete = (event: any, data: any) => {
      console.log("Operation completed:", data);
      // Refresh disks after operations complete
      setTimeout(() => refreshDisks(), 1000);
    };

    const handleOperationError = (event: any, data: any) => {
      console.error("Operation error:", data);
    };

    window.electronAPI.legacy.on("operation-progress", handleOperationProgress);
    window.electronAPI.legacy.on("ai-analysis-result", handleAIResult);
    window.electronAPI.legacy.on("disk-status-update", handleDiskStatusUpdate);
    window.electronAPI.legacy.on("tool-status-update", handleToolStatus);
    window.electronAPI.legacy.on("operation-complete", handleOperationComplete);
    window.electronAPI.legacy.on("operation-error", handleOperationError);

    return () => {
      window.electronAPI.legacy.removeListener(
        "operation-progress",
        handleOperationProgress,
      );
      window.electronAPI.legacy.removeListener("ai-analysis-result", handleAIResult);
      window.electronAPI.legacy.removeListener(
        "disk-status-update",
        handleDiskStatusUpdate,
      );
      window.electronAPI.legacy.removeListener("tool-status-update", handleToolStatus);
      window.electronAPI.legacy.removeListener(
        "operation-complete",
        handleOperationComplete,
      );
      window.electronAPI.legacy.removeListener(
        "operation-error",
        handleOperationError,
      );
    };
  }, [updateOperationState, mountedVolumes, refreshDisks]);

  // Load system info on context initialization
  useEffect(() => {
    loadSystemInfo();
  }, []);

  // Legacy compatibility methods
  const scanDisks = refreshDisks;
  const getAIRecommendations = aiAnalysisForDisk;

  const value: SecurityContextType = {
    // Authentication
    user,
    isAuthenticated,
    login,
    logout,

    // System Info
    systemInfo,
    loadSystemInfo,

    // Disk Management
    disks,
    selectedDisk,
    setSelectedDisk,
    refreshDisks,
    mountedVolumes,

    // Operation States
    encryptionState,
    decryptionState,
    mountState,

    // AI State
    aiRecommendations,
    isLoadingAI,

    // User Preferences
    encryptionPreferences,
    setEncryptionPreferences: setEncryptionPreferencesFunc,

    // Core Methods
    startEncryption,
    startDecryption,
    mountVolume,
    unmountVolume,
    aiAnalysisForDisk,

    // Legacy compatibility
    scanDisks,
    getAIRecommendations,
    updateOperationState,
  };

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  );
};

// Hook to use Context
export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (context === undefined) {
    throw new Error("useSecurity must be used within a SecurityProvider");
  }
  return context;
};
