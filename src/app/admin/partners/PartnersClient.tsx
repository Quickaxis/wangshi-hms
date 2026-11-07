"use client";

import { useState } from "react";
import { Partner } from "@/lib/types";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Plus, Edit2, Ban, CheckCircle2, Users, Mail, Building2, KeyRound, Eye, EyeOff } from "lucide-react";
import { updatePartnerAction, resetPartnerPasswordAction, createPartnerWithAuth } from "@/app/actions/admin";
import { useRouter } from "next/navigation";

export function PartnersClient({ initialPartners, homestayId }: { initialPartners: Partner[], homestayId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetPartnerId, setResetPartnerId] = useState<string | null>(null);
  const [resetAuthUserId, setResetAuthUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Partner> & { password?: string, confirmPassword?: string }>({ 
    is_active: true, 
    role: 'partner' 
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const filteredPartners = initialPartners;

  const handleOpenModal = (partner?: Partner) => {
    if (partner) {
      setEditingId(partner.id);
      setFormData(partner);
    } else {
      setEditingId(null);
      setFormData({ 
        is_active: true, 
        role: 'partner',
        homestay_id: homestayId 
      });
    }
    setError(null);
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!editingId) {
      if (!formData.password || formData.password.length < 8) {
        setError("Password must be at least 8 characters.");
        setIsLoading(false);
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match.");
        setIsLoading(false);
        return;
      }
    }
    
    let result;
    if (editingId) {
      result = await updatePartnerAction(editingId, formData as Partial<Partner>);
    } else {
      result = await createPartnerWithAuth(formData);
    }

    if (result.success) {
      setIsModalOpen(false);
      router.refresh();
    } else {
      setError(result.error || "An error occurred.");
    }
    setIsLoading(false);
  };

  const handleToggleActive = async (partner: Partner) => {
    const result = await updatePartnerAction(partner.id, { is_active: !partner.is_active });
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error || "An error occurred.");
    }
  };

  const handleOpenResetModal = (partner: Partner) => {
    if (!partner.auth_user_id) {
      alert("This partner does not have a linked Auth User ID.");
      return;
    }
    setResetPartnerId(partner.id);
    setResetAuthUserId(partner.auth_user_id);
    setNewPassword("");
    setError(null);
    setIsResetModalOpen(true);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetAuthUserId) return;
    
    setIsLoading(true);
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      setIsLoading(false);
      return;
    }

    const result = await resetPartnerPasswordAction(resetAuthUserId, newPassword);
    if (result.success) {
      setIsResetModalOpen(false);
      alert("Password successfully reset.");
    } else {
      setError(result.error || "Failed to reset password.");
    }
    setIsLoading(false);
  };

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white shadow-sm transition-colors text-sm font-semibold tracking-wide border border-[#B45309]"
        >
          <Plus className="w-4 h-4" /> Add Partner
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredPartners.length === 0 ? (
          <div className="col-span-full text-center py-10 text-[#77758F]">
            No partners found.
          </div>
        ) : (
          filteredPartners.map((partner) => (
            <GlassPanel key={partner.id} className={`p-5 rounded-2xl flex flex-col gap-4 relative bg-white border border-[#E8E6F2] shadow-sm ${!partner.is_active ? 'opacity-70' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#F0EEFF] flex items-center justify-center shrink-0 border border-[#E0DEF8]">
                    <Users className="w-5 h-5 text-[#5146D8]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#24213A]">{partner.name}</h4>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${partner.role === 'super_admin' ? 'bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8]' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                        {partner.role}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button 
                    onClick={() => handleOpenResetModal(partner)} 
                    className="p-1.5 rounded-lg hover:bg-[#F6F5FC] text-[#77758F] hover:text-[#24213A] border border-transparent hover:border-[#E8E6F2] transition-colors"
                    title="Reset Password"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleOpenModal(partner)} className="p-1.5 rounded-lg hover:bg-[#F6F5FC] text-[#77758F] hover:text-[#24213A] border border-transparent hover:border-[#E8E6F2] transition-colors" title="Edit Partner">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleToggleActive(partner)} 
                    className="p-1.5 rounded-lg hover:bg-[#F6F5FC] text-[#77758F] hover:text-[#24213A] border border-transparent hover:border-[#E8E6F2] transition-colors"
                    title={partner.is_active ? "Disable" : "Reactivate"}
                  >
                    {partner.is_active ? <Ban className="w-4 h-4 text-rose-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2 mt-2">
                <div className="flex items-center gap-2 text-xs text-[#55536A]">
                  <Mail className="w-3.5 h-3.5 text-[#77758F] shrink-0" /> <span>{partner.email}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#55536A]">
                  <Building2 className="w-3.5 h-3.5 text-[#77758F] shrink-0" /> <span>{partner.role === 'super_admin' ? 'All Homestays' : (partner.homestay?.name || 'Unassigned')}</span>
                </div>
              </div>
            </GlassPanel>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassPanel className="w-full max-w-md p-6 rounded-2xl relative bg-white border border-[#E8E6F2] shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[#24213A] mb-4">{editingId ? "Edit Partner" : "Add Partner"}</h3>
            
            {error && <div className="mb-4 text-rose-600 text-xs bg-rose-50 border border-rose-200 p-3 rounded-lg">{error}</div>}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Full Name *</label>
                <input
                  required
                  type="text"
                  value={formData.name || ''}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Email *</label>
                <input
                  required
                  type="email"
                  value={formData.email || ''}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm"
                />
              </div>

              {!editingId && (
                <>
                  <div className="relative">
                    <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Password *</label>
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      value={formData.password || ''}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm pr-10"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-[28px] text-[#77758F] hover:text-[#24213A]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="relative">
                    <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Confirm Password *</label>
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      value={formData.confirmPassword || ''}
                      onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                      className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm pr-10"
                    />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Role *</label>
                  <select
                    required
                    disabled={!!editingId}
                    value={formData.role || 'partner'}
                    onChange={e => setFormData({...formData, role: e.target.value})}
                    className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] outline-none focus:border-[#5146D8] disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <option value="partner" className="text-[#24213A]">Partner</option>
                  </select>
                </div>
              </div>
              
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.is_active || false}
                  onChange={e => setFormData({...formData, is_active: e.target.checked})}
                  className="w-4 h-4 bg-white border-[#E8E6F2] rounded text-[#5146D8] focus:ring-0 focus:ring-offset-0"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-[#24213A] cursor-pointer">Active Account</label>
              </div>

              <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-[#E8E6F2]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-[#55536A] hover:bg-[#F6F5FC] border border-[#E8E6F2] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 rounded-xl bg-[#5146D8] hover:bg-[#4338CA] text-white text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </GlassPanel>
        </div>
      )}

      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassPanel className="w-full max-w-sm p-6 rounded-2xl relative bg-white border border-[#E8E6F2] shadow-xl">
            <h3 className="text-lg font-bold text-[#24213A] mb-4">Reset Password</h3>
            
            {error && <div className="mb-4 text-rose-600 text-xs bg-rose-50 border border-rose-200 p-3 rounded-lg">{error}</div>}
            
            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div className="relative">
                <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">New Password *</label>
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] pr-10 transition-colors shadow-sm"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[28px] text-[#77758F] hover:text-[#24213A]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-[#E8E6F2]">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-[#55536A] hover:bg-[#F6F5FC] border border-[#E8E6F2] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 rounded-xl bg-[#5146D8] hover:bg-[#4338CA] text-white text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Resetting...' : 'Reset'}
                </button>
              </div>
            </form>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
