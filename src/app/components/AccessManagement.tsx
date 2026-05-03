import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UserPlus, Shield, Mail, Phone } from "lucide-react";
import { GlassCard } from "./GlassCard";

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "Admin" | "Manager" | "Operator";
  status: "Active" | "Inactive";
}

export function AccessManagement() {
  const [users] = useState<User[]>([
    {
      id: "1",
      name: "John Doe",
      email: "john.doe@example.com",
      phone: "+972 50-123-4567",
      role: "Admin",
      status: "Active",
    },
    {
      id: "2",
      name: "Jane Smith",
      email: "jane.smith@example.com",
      phone: "+972 50-234-5678",
      role: "Manager",
      status: "Active",
    },
    {
      id: "3",
      name: "Mike Johnson",
      email: "mike.johnson@example.com",
      phone: "+972 50-345-6789",
      role: "Operator",
      status: "Active",
    },
    {
      id: "4",
      name: "Sarah Williams",
      email: "sarah.williams@example.com",
      phone: "+972 50-456-7890",
      role: "Operator",
      status: "Inactive",
    },
  ]);

  const getRoleColor = (role: User["role"]) => {
    switch (role) {
      case "Admin":
        return "bg-red-100 text-red-700 border-red-300";
      case "Manager":
        return "bg-blue-100 text-blue-700 border-blue-300";
      case "Operator":
        return "bg-gray-100 text-gray-700 border-gray-300";
    }
  };

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl text-black mb-2">Access Management</h2>
            <p className="text-gray-700">Manage user roles and permissions</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg hover:shadow-red-500/60 transition-all duration-300 flex items-center gap-2"
          >
            <UserPlus className="w-5 h-5" />
            Add User
          </motion.button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Users", value: "24", color: "from-blue-500 to-blue-600" },
            { label: "Active Users", value: "18", color: "from-green-500 to-green-600" },
            { label: "Admins", value: "3", color: "from-red-500 to-red-600" },
            { label: "Operators", value: "15", color: "from-gray-500 to-gray-600" },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-xs mb-1">{stat.label}</p>
                    <p className="text-2xl text-black">{stat.value}</p>
                  </div>
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}
                  >
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        <GlassCard>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-300/60">
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Name</th>
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Email</th>
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Phone</th>
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Role</th>
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {users.map((user, index) => (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="border-b border-gray-200/60 hover:bg-white/40 transition-all duration-200"
                    >
                      <td className="py-4 px-4">
                        <span className="text-black">{user.name}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-gray-600" />
                          <span className="text-gray-700 text-sm">{user.email}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-600" />
                          <span className="text-gray-700 text-sm">{user.phone}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs border ${getRoleColor(
                            user.role
                          )}`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs border ${
                            user.status === "Active"
                              ? "bg-green-100 text-green-700 border-green-300"
                              : "bg-gray-100 text-gray-700 border-gray-300"
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex gap-2">
                          <button className="px-3 py-1 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600 transition-all">
                            Edit
                          </button>
                          <button className="px-3 py-1 rounded-lg bg-red-500 text-white text-xs hover:bg-red-600 transition-all">
                            Remove
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
