"use client";

import { useState } from "react";
import { DbRoom } from "@/lib/types";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Plus, Edit2, Ban, CheckCircle2, Building2, Trash2 } from "lucide-react";
import { addRoomAction, updateRoomAction } from "@/app/actions/admin";
import { useRouter } from "next/navigation";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { DeleteRoomModal } from "@/components/modals/DeleteRoomModal";

export function RoomsClient({ initialRooms, homestayId }: { initialRooms: DbRoom[], homestayId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<DbRoom | null>(null);
  const [formData, setFormData] = useState<Partial<DbRoom>>({ is_active: true });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refreshData } = useHMSContext();

  const filteredRooms = initialRooms;

  const handleOpenModal = (room?: DbRoom) => {
    if (room) {
      setEditingId(room.id);
      setFormData(room);
    } else {
      setEditingId(null);
      setFormData({ 
        is_active: true, 
        homestay_id: homestayId 
      });
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedNum = formData.room_number?.trim();
    if (normalizedNum) {
      const isDuplicate = initialRooms.some(r => 
        r.room_number?.trim().toLowerCase() === normalizedNum.toLowerCase() && 
        r.id !== editingId
      );
      if (isDuplicate) {
        setError(`Room number "${normalizedNum}" already exists in this homestay. Please use a unique room number.`);
        return;
      }
    }

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
      await refreshData();
      router.refresh();
    } else {
      setError(result.error || "An error occurred.");
    }
    setIsLoading(false);
  };

  const handleToggleActive = async (room: DbRoom) => {
    const result = await updateRoomAction(room.id, { is_active: !room.is_active });
    if (result.success) {
      await refreshData();
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
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white shadow-sm transition-colors text-sm font-semibold tracking-wide border border-[#B45309]"
        >
          <Plus className="w-4 h-4" /> Add Room
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredRooms.length === 0 ? (
          <div className="col-span-full text-center py-10 text-[#77758F]">
            No rooms found.
          </div>
        ) : (
          filteredRooms.map((room) => (
            <GlassPanel key={room.id} className={`p-5 rounded-2xl flex flex-col gap-4 relative bg-white border border-[#E8E6F2] shadow-sm ${!room.is_active ? 'opacity-70' : ''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-[#24213A]">{room.name}</h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${room.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                      {room.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Building2 className="w-3 h-3 text-[#77758F]" />
                    <span className="text-xs text-[#77758F]">{room.homestay?.name || 'Room #' + room.room_number}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleOpenModal(room)} 
                    className="p-1.5 rounded-lg hover:bg-[#F6F5FC] text-[#77758F] hover:text-[#24213A] border border-transparent hover:border-[#E8E6F2] transition-colors"
                    title="Edit Room"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleToggleActive(room)} 
                    className="p-1.5 rounded-lg hover:bg-[#F6F5FC] text-[#77758F] hover:text-[#24213A] border border-transparent hover:border-[#E8E6F2] transition-colors"
                    title={room.is_active ? "Deactivate" : "Activate"}
                  >
                    {room.is_active ? <Ban className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </button>
                  <button
                    onClick={() => setDeletingRoom(room)}
                    className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 hover:text-rose-700 border border-transparent hover:border-rose-100 transition-colors"
                    title="Permanently Delete Room"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 mt-2">
                <div className="flex justify-between items-center text-xs border-b border-[#E8E6F2] pb-2">
                  <span className="text-[#77758F]">Room Number</span>
                  <span className="font-bold text-[#24213A]">#{room.room_number}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b border-[#E8E6F2] pb-2">
                  <span className="text-[#77758F]">Price / Night</span>
                  <span className="font-bold text-[#24213A]">₹{room.nightly_rate}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b border-[#E8E6F2] pb-2">
                  <span className="text-[#77758F]">Max Guests</span>
                  <span className="font-bold text-[#24213A]">{room.max_guests}</span>
                </div>
                {room.bathroom_type && (
                  <div className="flex justify-between items-center text-xs border-b border-[#E8E6F2] pb-2">
                    <span className="text-[#77758F]">Bathroom</span>
                    <span className="font-medium text-[#24213A] truncate max-w-[120px]" title={room.bathroom_type}>{room.bathroom_type}</span>
                  </div>
                )}
                {room.description && (
                  <div className="text-xs text-[#55536A] line-clamp-2 pt-1" title={room.description}>
                    {room.description}
                  </div>
                )}
              </div>
            </GlassPanel>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassPanel className="w-full max-w-lg p-6 rounded-2xl relative bg-white border border-[#E8E6F2] shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[#24213A] mb-4">{editingId ? "Edit Room" : "Add Room"}</h3>
            
            {error && <div className="mb-4 text-rose-600 text-xs bg-rose-50 border border-rose-200 p-3 rounded-lg">{error}</div>}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Room Number *</label>
                  <input
                    required
                    type="text"
                    value={formData.room_number || ''}
                    onChange={e => setFormData({...formData, room_number: e.target.value})}
                    placeholder="e.g. 101 or 1"
                    className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Room Name *</label>
                  <input
                    required
                    type="text"
                    value={formData.name || ''}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. Deluxe Suite"
                    className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Price / Night (₹) *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={formData.nightly_rate || ''}
                    onChange={e => setFormData({...formData, nightly_rate: parseInt(e.target.value) || 0})}
                    placeholder="2500"
                    className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Max Guests *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={formData.max_guests || ''}
                    onChange={e => setFormData({...formData, max_guests: parseInt(e.target.value) || 0})}
                    placeholder="3"
                    className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#686579] uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={formData.description || ''}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Optional description of the room..."
                  className="w-full bg-white border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-sm text-[#24213A] placeholder-[#9D9AA8] outline-none focus:border-[#5146D8] transition-colors resize-none shadow-sm"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active ?? true}
                  onChange={e => setFormData({...formData, is_active: e.target.checked})}
                  className="w-4 h-4 bg-white border-[#E8E6F2] rounded text-[#5146D8] focus:ring-0 focus:ring-offset-0"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-[#24213A] cursor-pointer">
                  Active (Available for booking)
                </label>
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
                  {isLoading ? 'Saving...' : 'Save Room'}
                </button>
              </div>
            </form>
          </GlassPanel>
        </div>
      )}

      <DeleteRoomModal
        isOpen={!!deletingRoom}
        onClose={() => setDeletingRoom(null)}
        room={deletingRoom}
        onDeleted={async () => {
          await refreshData();
          router.refresh();
        }}
      />
    </div>
  );
}
