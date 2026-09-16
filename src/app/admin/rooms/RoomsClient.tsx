"use client";

import { useState } from "react";
import { DbRoom, Homestay } from "@/lib/types";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Plus, Edit2, Ban, CheckCircle2, BedDouble, Building2 } from "lucide-react";
import { addRoomAction, updateRoomAction } from "@/app/actions/admin";
import { useRouter } from "next/navigation";

export function RoomsClient({ initialRooms, homestayId }: { initialRooms: DbRoom[], homestayId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<DbRoom>>({ is_active: true, breakfast_included: true });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const filteredRooms = initialRooms;

  const handleOpenModal = (room?: DbRoom) => {
    if (room) {
      setEditingId(room.id);
      setFormData(room);
    } else {
      setEditingId(null);
      setFormData({ 
        is_active: true, 
        breakfast_included: true, 
        homestay_id: homestayId 
      });
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
      result = await updateRoomAction(editingId, formData);
    } else {
      result = await addRoomAction(formData);
    }

    if (result.success) {
      setIsModalOpen(false);
      router.refresh();
    } else {
      setError(result.error || "An error occurred.");
    }
    setIsLoading(false);
  };

  const handleToggleActive = async (room: DbRoom) => {
    const result = await updateRoomAction(room.id, { is_active: !room.is_active });
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error || "An error occurred.");
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-6">

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[rgba(245,158,11,0.2)] text-[#F59E0B] hover:bg-[rgba(245,158,11,0.3)] transition-colors text-sm font-semibold tracking-wide border border-[rgba(245,158,11,0.4)]"
        >
          <Plus className="w-4 h-4" /> Add Room
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredRooms.length === 0 ? (
          <div className="col-span-full text-center py-10 text-[#96928A]">
            No rooms found.
          </div>
        ) : (
          filteredRooms.map((room) => (
            <GlassPanel key={room.id} className={`p-5 rounded-2xl flex flex-col gap-4 relative ${!room.is_active ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-sm font-bold text-[#F5F1E8]">{room.name}</h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Building2 className="w-3 h-3 text-[#96928A]" />
                    <span className="text-xs text-[#96928A]">{room.homestay?.name || 'Unknown'}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleOpenModal(room)} className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.1)] text-[#96928A] hover:text-white transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleToggleActive(room)} 
                    className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.1)] text-[#96928A] hover:text-white transition-colors"
                  >
                    {room.is_active ? <Ban className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-green-400" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2 mt-2">
                <div className="flex justify-between items-center text-xs border-b border-[rgba(255,255,255,0.05)] pb-2">
                  <span className="text-[#96928A]">Price / Night</span>
                  <span className="font-bold text-[#F5F1E8]">₹{room.nightly_rate}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b border-[rgba(255,255,255,0.05)] pb-2">
                  <span className="text-[#96928A]">Max Guests</span>
                  <span className="font-bold text-[#F5F1E8]">{room.max_guests}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b border-[rgba(255,255,255,0.05)] pb-2">
                  <span className="text-[#96928A]">Bathroom</span>
                  <span className="font-medium text-[#F5F1E8] truncate max-w-[120px]" title={room.bathroom_type}>{room.bathroom_type}</span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="text-[#96928A]">Breakfast</span>
                  <span className="font-medium text-[#F5F1E8]">{room.breakfast_included ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </GlassPanel>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassPanel className="w-full max-w-lg p-6 rounded-2xl relative border border-[rgba(255,255,255,0.1)] max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[#F5F1E8] mb-4">{editingId ? "Edit Room" : "Add Room"}</h3>
            
            {error && <div className="mb-4 text-red-400 text-xs bg-red-400/10 p-3 rounded-lg">{error}</div>}
            
            <form onSubmit={handleSubmit} className="space-y-4">


              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#96928A] uppercase tracking-wider mb-1.5">Room Number *</label>
                  <input
                    required
                    type="text"
                    value={formData.room_number || ''}
                    onChange={e => setFormData({...formData, room_number: e.target.value})}
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-sm text-[#F5F1E8] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#96928A] uppercase tracking-wider mb-1.5">Room Name *</label>
                  <input
                    required
                    type="text"
                    value={formData.name || ''}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-sm text-[#F5F1E8] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#96928A] uppercase tracking-wider mb-1.5">Price / Night (₹) *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={formData.nightly_rate || ''}
                    onChange={e => setFormData({...formData, nightly_rate: parseInt(e.target.value)})}
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-sm text-[#F5F1E8] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#96928A] uppercase tracking-wider mb-1.5">Max Guests *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={formData.max_guests || ''}
                    onChange={e => setFormData({...formData, max_guests: parseInt(e.target.value)})}
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-sm text-[#F5F1E8] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#96928A] uppercase tracking-wider mb-1.5">Bathroom Type *</label>
                <input
                  required
                  type="text"
                  value={formData.bathroom_type || ''}
                  onChange={e => setFormData({...formData, bathroom_type: e.target.value})}
                  className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-sm text-[#F5F1E8] outline-none"
                  placeholder="e.g. Attached toilet & bathroom"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-[#96928A] uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  rows={2}
                  value={formData.description || ''}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-sm text-[#F5F1E8] outline-none resize-none"
                />
              </div>

              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={e => setFormData({...formData, is_active: e.target.checked})}
                    className="w-4 h-4 bg-transparent border-[rgba(255,255,255,0.2)] rounded text-[#F59E0B]"
                  />
                  <label htmlFor="is_active" className="text-sm text-[#C7C3BA]">Active</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="breakfast_included"
                    checked={formData.breakfast_included}
                    onChange={e => setFormData({...formData, breakfast_included: e.target.checked})}
                    className="w-4 h-4 bg-transparent border-[rgba(255,255,255,0.2)] rounded text-[#F59E0B]"
                  />
                  <label htmlFor="breakfast_included" className="text-sm text-[#C7C3BA]">Breakfast Included</label>
                </div>
              </div>

              {formData.breakfast_included && (
                <div>
                  <label className="block text-xs font-semibold text-[#96928A] uppercase tracking-wider mb-1.5">Breakfast Details</label>
                  <input
                    type="text"
                    value={formData.breakfast_details || ''}
                    onChange={e => setFormData({...formData, breakfast_details: e.target.value})}
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-sm text-[#F5F1E8] outline-none"
                  />
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-[rgba(255,255,255,0.05)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-[#C7C3BA] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-black text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
