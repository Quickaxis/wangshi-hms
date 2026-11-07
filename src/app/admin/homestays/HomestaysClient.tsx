"use client";

import { useState } from "react";
import { Homestay } from "@/lib/types";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Plus, Edit2, Building2, Phone, MapPin, Mail, Ban, CheckCircle2, Trash2 } from "lucide-react";
import { addHomestayAction, updateHomestayAction } from "@/app/actions/admin";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { DeleteHomestayModal } from "@/components/modals/DeleteHomestayModal";

export function HomestaysClient({ initialHomestays }: { initialHomestays: Homestay[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingHomestay, setDeletingHomestay] = useState<Homestay | null>(null);
  const [formData, setFormData] = useState<Partial<Homestay>>({ is_active: true });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refreshHomestays } = useHMSContext();

  const handleOpenModal = (homestay?: Homestay) => {
    if (homestay) {
      setEditingId(homestay.id);
      setFormData(homestay);
    } else {
      setEditingId(null);
      setFormData({ is_active: true });
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    let result;
    if (editingId) {
      result = await updateHomestayAction(editingId, formData);
    } else {
      result = await addHomestayAction(formData);
    }

    if (result.success) {
      setIsModalOpen(false);
      await refreshHomestays();
      router.refresh();
    } else {
      setError(result.error || "An error occurred.");
    }
    setIsLoading(false);
  };

  const handleToggleActive = async (homestay: Homestay) => {
    const result = await updateHomestayAction(homestay.id, { is_active: !homestay.is_active });
    if (result.success) {
      await refreshHomestays();
      router.refresh();
    } else {
      alert(result.error || "An error occurred.");
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white shadow-sm transition-colors text-sm font-semibold tracking-wide border border-[#B45309]"
        >
          <Plus className="w-4 h-4" /> Add Homestay
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {initialHomestays.length === 0 ? (
          <div className="col-span-full text-center py-10 text-[#77758F]">
            No homestays found. Add your first homestay!
          </div>
        ) : (
          initialHomestays.map((homestay) => (
            <div key={homestay.id}>
              <GlassPanel className={`p-5 rounded-2xl flex flex-col gap-4 relative bg-white border border-[#E8E6F2] shadow-sm ${!homestay.is_active ? 'opacity-70' : ''}`}>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F0EEFF] flex items-center justify-center shrink-0 border border-[#E0DEF8]">
                      {homestay.logo_url ? (
                        <img src={homestay.logo_url} alt="Logo" className="w-6 h-6 object-contain" />
                      ) : (
                        <Building2 className="w-5 h-5 text-[#5146D8]" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#24213A]">{homestay.name}</h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${homestay.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                        {homestay.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/admin/homestays/${homestay.id}`} className="px-3 py-1.5 rounded-lg bg-[#F0EEFF] hover:bg-[#E0DEF8] text-[#24213A] border border-[#E0DEF8] text-xs font-semibold transition-colors">
                      Manage
                    </Link>
                    <button onClick={() => handleOpenModal(homestay)} className="p-1.5 rounded-lg hover:bg-[#F6F5FC] text-[#77758F] hover:text-[#24213A] border border-transparent hover:border-[#E8E6F2] transition-colors" title="Edit Property">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleToggleActive(homestay)} 
                      className="p-1.5 rounded-lg hover:bg-[#F6F5FC] text-[#77758F] hover:text-[#24213A] border border-transparent hover:border-[#E8E6F2] transition-colors"
                      title={homestay.is_active ? "Deactivate" : "Reactivate"}
                    >
                      {homestay.is_active ? <Ban className="w-4 h-4 text-rose-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </button>
                    <button
                      onClick={() => setDeletingHomestay(homestay)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 hover:text-rose-700 border border-transparent hover:border-rose-100 transition-colors"
                      title="Permanently Delete Property"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 mt-2">
                  {homestay.location && (
                    <div className="flex items-center gap-2 text-xs text-[#55536A]">
                      <MapPin className="w-3.5 h-3.5 text-[#77758F] shrink-0" /> <span>{homestay.location}</span>
                    </div>
                  )}
                  {homestay.phone && (
                    <div className="flex items-center gap-2 text-xs text-[#55536A]">
                      <Phone className="w-3.5 h-3.5 text-[#77758F] shrink-0" /> <span>{homestay.phone}</span>
                    </div>
                  )}
                  {homestay.email && (
                    <div className="flex items-center gap-2 text-xs text-[#55536A]">
                      <Mail className="w-3.5 h-3.5 text-[#77758F] shrink-0" /> <span>{homestay.email}</span>
                    </div>
                  )}
                </div>
              </GlassPanel>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassPanel className="w-full max-w-md p-6 rounded-2xl relative bg-white border border-[#E8E6F2] shadow-xl">
            <h3 className="text-lg font-bold text-[#24213A] mb-4">{editingId ? "Edit Homestay" : "Add Homestay"}</h3>
            
            {error && <div className="mb-4 text-rose-600 text-xs bg-rose-50 border border-rose-200 p-3 rounded-lg">{error}</div>}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Name *</label>
                <input
                  required
                  type="text"
                  value={formData.name || ''}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Location</label>
                <input
                  type="text"
                  value={formData.location || ''}
                  onChange={e => setFormData({...formData, location: e.target.value})}
                  className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Phone</label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.is_active}
                  onChange={e => setFormData({...formData, is_active: e.target.checked})}
                  className="w-4 h-4 bg-white border-[#E8E6F2] rounded text-[#5146D8] focus:ring-0 focus:ring-offset-0"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-[#24213A] cursor-pointer">Active</label>
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

      <DeleteHomestayModal
        isOpen={!!deletingHomestay}
        onClose={() => setDeletingHomestay(null)}
        homestay={deletingHomestay}
        onDeleted={async () => {
          await refreshHomestays();
          router.refresh();
        }}
      />
    </div>
  );
}
