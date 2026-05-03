import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useState } from "react";

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderData: {
    orderId: string;
    pointA: string;
    pointB: string;
    scheduledFor: string;
    status: string;
    driverName?: string;
    driverPhone?: string;
    vehicleDetails?: string;
    licensePlate?: string;
    clientCost?: string;
    progressStatus?: string;
    priceForClient?: string;
  };
}

export function OrderDetailModal({ isOpen, onClose, orderData }: OrderDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"route" | "details">("route");

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-md z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="w-full max-w-3xl bg-white/80 backdrop-blur-3xl rounded-3xl border border-white shadow-2xl shadow-black/20 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-300/60">
                <h3 className="text-lg text-black font-medium">B2B Order {orderData.orderId}</h3>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="w-10 h-10 rounded-xl bg-white/40 hover:bg-white/60 flex items-center justify-center transition-all duration-300 backdrop-blur-xl border border-white/60"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </motion.button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-300/60 px-6">
                <motion.button
                  whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.3)" }}
                  onClick={() => setActiveTab("route")}
                  className={`px-6 py-3 text-sm transition-all duration-300 relative ${
                    activeTab === "route" ? "text-black font-medium" : "text-gray-600"
                  }`}
                >
                  Route
                  {activeTab === "route" && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-red-600"
                    />
                  )}
                </motion.button>
                <motion.button
                  whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.3)" }}
                  onClick={() => setActiveTab("details")}
                  className={`px-6 py-3 text-sm transition-all duration-300 relative ${
                    activeTab === "details" ? "text-black font-medium" : "text-gray-600"
                  }`}
                >
                  Details
                  {activeTab === "details" && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-red-600"
                    />
                  )}
                </motion.button>
              </div>

              {/* Content */}
              <div className="p-6">
                <AnimatePresence mode="wait">
                  {activeTab === "route" && (
                    <motion.div
                      key="route"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                      className="grid grid-cols-2 gap-6"
                    >
                      {/* Route Column */}
                      <div className="space-y-4">
                        <div className="p-4 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60">
                          <h4 className="text-sm text-black font-medium mb-4">Route</h4>
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Point A</p>
                              <p className="text-sm text-black">{orderData.pointA}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Point B</p>
                              <p className="text-sm text-black">{orderData.pointB}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Scheduled for</p>
                              <p className="text-sm text-black">{orderData.scheduledFor}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Status</p>
                              <p className="text-sm text-black">{orderData.status}</p>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60">
                          <h4 className="text-sm text-black font-medium mb-4">Driver & Vehicle</h4>
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Driver full name</p>
                              <p className="text-sm text-black">{orderData.driverName || "Not provided by API"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Driver phone</p>
                              <p className="text-sm text-black">{orderData.driverPhone || "Not provided by API"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Vehicle details</p>
                              <p className="text-sm text-black">{orderData.vehicleDetails || "Not provided by API"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">License plate</p>
                              <p className="text-sm text-black">{orderData.licensePlate || "Not provided by API"}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Details Column */}
                      <div>
                        <div className="p-4 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60">
                          <h4 className="text-sm text-black font-medium mb-4">Details</h4>
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Order ID</p>
                              <p className="text-sm text-black">{orderData.orderId}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Not provided by API</p>
                              <p className="text-sm text-gray-500 italic">Test provided by API</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Client cost</p>
                              <p className="text-sm text-black">{orderData.clientCost || "60.00"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Progress status</p>
                              <p className="text-sm text-black">{orderData.progressStatus || "complete"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Price for client</p>
                              <p className="text-sm text-black">{orderData.priceForClient || "46.62"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Account trip time</p>
                              <p className="text-sm text-gray-500 italic">Not provided by API</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 mb-1">Closed fields</p>
                              <p className="text-sm text-gray-500 italic">Not provided by API</p>
                            </div>
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className="mt-2 text-xs text-gray-600 hover:text-black transition-colors"
                            >
                              + ADD API KEYVALUE
                            </motion.button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "details" && (
                    <motion.div
                      key="details"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Order ID</p>
                        <p className="text-sm text-black">{orderData.orderId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Status</p>
                        <p className="text-sm text-black">{orderData.status}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Scheduled for</p>
                        <p className="text-sm text-black">{orderData.scheduledFor}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
