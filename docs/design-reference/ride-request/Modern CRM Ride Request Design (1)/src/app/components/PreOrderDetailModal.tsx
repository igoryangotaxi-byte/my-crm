import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

interface PreOrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderData: {
    date: string;
    pickup: string;
    destination: string;
    pointA: string;
    scheduledFor: string;
    createdAt?: string;
    clientId?: string;
    recipientPhone?: string;
    driverName?: string;
    driverId?: string;
    rideType?: string;
    serviceClass?: string;
    providerDeeplink?: string;
    orderId: string;
  };
}

export function PreOrderDetailModal({ isOpen, onClose, orderData }: PreOrderDetailModalProps) {
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
                <h3 className="text-lg text-black font-medium">Order at {orderData.date}</h3>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="w-10 h-10 rounded-xl bg-white/40 hover:bg-white/60 flex items-center justify-center transition-all duration-300 backdrop-blur-xl border border-white/60"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </motion.button>
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="grid grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    {/* Pickup & Destination */}
                    <div className="p-4 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Pickup</p>
                        <p className="text-sm text-black">{orderData.pickup}</p>
                        <p className="text-sm text-black">{orderData.destination}</p>
                      </div>
                    </div>

                    {/* Route */}
                    <div className="p-4 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60">
                      <h4 className="text-sm text-black font-medium mb-4">Route</h4>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Point A</p>
                          <p className="text-sm text-black">{orderData.pointA}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Scheduled for</p>
                          <p className="text-sm text-black">{orderData.scheduledFor}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Created at</p>
                          <p className="text-sm text-gray-500 italic">
                            {orderData.createdAt || "Not provided by API"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Server Details */}
                    <div className="p-4 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60">
                      <h4 className="text-sm text-black font-medium mb-4">SERVER DETAILS</h4>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Client ID</p>
                          <p className="text-sm text-gray-500 italic">
                            {orderData.clientId || "Not provided by API"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Recipient phone</p>
                          <p className="text-sm text-gray-500 italic">
                            {orderData.recipientPhone || "Not provided by API"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Driver name</p>
                          <p className="text-sm text-gray-500 italic">
                            {orderData.driverName || "Not provided by API"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Driver ID</p>
                          <p className="text-sm text-gray-500 italic">
                            {orderData.driverId || "Not provided by API"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Details */}
                  <div>
                    <div className="p-4 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60 h-full flex flex-col">
                      <h4 className="text-sm text-black font-medium mb-4">Details</h4>
                      <div className="space-y-3 flex-1">
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Ride type</p>
                          <p className="text-sm text-black">{orderData.rideType || "Regular request"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Service class</p>
                          <p className="text-sm text-black">{orderData.serviceClass || "Extended price"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Created at</p>
                          <p className="text-sm text-black">{orderData.scheduledFor}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Provider Deeplink info</p>
                          <p className="text-sm text-gray-500 italic">
                            {orderData.providerDeeplink || "Not provided by API"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Order</p>
                          <p className="text-sm text-black">{orderData.orderId}</p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-6 space-y-3">
                        <motion.button
                          whileHover={{ scale: 1.02, y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          className="w-full px-4 py-3 rounded-2xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all duration-300 text-sm font-medium shadow-sm hover:shadow-md"
                        >
                          Cancel order in Yango
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.02, y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          className="w-full px-4 py-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-all duration-300 text-sm font-medium shadow-sm hover:shadow-md"
                        >
                          Open in Yango B2C
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
