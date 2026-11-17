"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { GlassModal } from "@/components/ui/GlassModal";
import { 
  Building2, 
  DoorClosed,
  Clock,
  Receipt,
  Image as ImageIcon, 
  ShieldCheck,
  Lock, 
  UploadCloud, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Plus,
  Edit2,
  Ban,
  Archive,
  RefreshCw,
  Info,
  DollarSign,
  UserCheck,
  Check,
  X,
  Bell
} from "lucide-react";
import { NotificationSettingsTab } from "@/components/settings/NotificationSettingsTab";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { 
  uploadLogoAction, 
  removeLogoAction, 
  uploadInvoiceLogoAction,
  changePasswordAction,
  updatePropertyProfileAction,
  updatePoliciesAction,
  updateBillingSettingsAction,
  updateBrandingSettingsAction,
  saveRoomConfigAction,
  toggleRoomActiveAction,
  archiveRoomAction,
  restoreRoomAction
} from "@/app/actions/settings";
import { Room } from "@/lib/types";

type Tab = 'profile' | 'rooms' | 'policies' | 'billing' | 'branding' | 'security' | 'notifications';

export default function SettingsPage() {
  const { userProfile, homestays, selectedHomestayId, rooms, refreshHomestays, refreshData } = useHMSContext();
  const currentHomestay = homestays.find(h => h.id === selectedHomestayId) || homestays[0];
  const isAdmin = userProfile?.role === 'super_admin';

  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Status feedback
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // -------------------------------------------------------------------------
  // 1. PROPERTY PROFILE STATE
  // -------------------------------------------------------------------------
  const [profileForm, setProfileForm] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
    email: "",
    website: "",
    location: ""
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (currentHomestay) {
      setProfileForm({
        name: currentHomestay.name || "",
        address: currentHomestay.address || "",
        city: currentHomestay.city || "",
        state: currentHomestay.state || "",
        pincode: currentHomestay.pincode || "",
        phone: currentHomestay.phone || "",
        email: currentHomestay.email || "",
        website: currentHomestay.website || "",
        location: currentHomestay.location || ""
      });
    }
  }, [currentHomestay]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHomestay) return;
    setIsSavingProfile(true);
    try {
      const res = await updatePropertyProfileAction({
        homestayId: currentHomestay.id,
        ...profileForm
      });
      if (res.success) {
        showToast("success", res.message || "Property profile updated.");
        await refreshHomestays();
      } else {
        showToast("error", res.error || "Failed to update profile.");
      }
    } catch (err: any) {
      showToast("error", err.message || "An unexpected error occurred.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // -------------------------------------------------------------------------
  // 2. ROOM CONFIGURATION STATE
  // -------------------------------------------------------------------------
  const [roomFilterTab, setRoomFilterTab] = useState<'active' | 'archived' | 'all'>('active');
  const [editingRoom, setEditingRoom] = useState<Partial<Room> | null>(null);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [roomActionLoadingId, setRoomActionLoadingId] = useState<string | null>(null);

  const displayedRooms = useMemo(() => {
    return rooms.filter(r => {
      const isArchived = (r as any).is_archived === true;
      if (roomFilterTab === 'active') return r.is_active !== false && !isArchived;
      if (roomFilterTab === 'archived') return isArchived || r.is_active === false;
      return true;
    });
  }, [rooms, roomFilterTab]);

  const handleOpenAddRoom = () => {
    setEditingRoom({
      room_number: "",
      name: "",
      room_type: "",
      nightly_rate: 2500,
      pricePerNight: 2500,
      max_guests: 2,
      maxCapacity: 2,
      bathroom_type: "Attached toilet & bathroom",
      description: "",
      is_active: true
    });
    setIsRoomModalOpen(true);
  };

  const handleOpenEditRoom = (room: Room) => {
    setEditingRoom({
      id: room.id,
      room_number: room.room_number || "",
      name: room.name,
      room_type: (room as any).room_type || "",
      nightly_rate: room.nightly_rate || room.pricePerNight,
      pricePerNight: room.pricePerNight || room.nightly_rate,
      max_guests: room.max_guests || room.maxCapacity,
      maxCapacity: room.maxCapacity || room.max_guests,
      bathroom_type: room.bathroom_type || room.bathroomInfo || "Attached toilet & bathroom",
      description: room.description || "",
      is_active: room.is_active !== false
    });
    setIsRoomModalOpen(true);
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHomestay || !editingRoom) return;

    const normalizedNum = editingRoom.room_number?.trim();
    if (normalizedNum) {
      const isDuplicate = rooms.some(r => 
        r.room_number?.trim().toLowerCase() === normalizedNum.toLowerCase() && 
        r.id !== editingRoom.id
      );
      if (isDuplicate) {
        showToast("error", `Room number "${normalizedNum}" already exists in this homestay. Please use a unique room number.`);
        return;
      }
    }

    setIsSavingRoom(true);
    try {
      const res = await saveRoomConfigAction({
        id: editingRoom.id,
        homestayId: currentHomestay.id,
        room_number: editingRoom.room_number || "",
        name: editingRoom.name || "",
        room_type: (editingRoom as any).room_type || "Standard Room",
        description: editingRoom.description || "",
        nightly_rate: Number(editingRoom.nightly_rate || editingRoom.pricePerNight || 0),
        max_guests: Number(editingRoom.max_guests || editingRoom.maxCapacity || 1),
        bathroom_type: editingRoom.bathroom_type || "Attached toilet & bathroom",
        is_active: editingRoom.is_active !== false
      });

      if (res.success) {
        showToast("success", res.message || "Room saved successfully.");
        setIsRoomModalOpen(false);
        setEditingRoom(null);
        await refreshData();
      } else {
        showToast("error", res.error || "Failed to save room.");
      }
    } catch (err: any) {
      showToast("error", err.message || "An unexpected error occurred.");
    } finally {
      setIsSavingRoom(false);
    }
  };

  const handleToggleRoomActive = async (room: Room) => {
    setRoomActionLoadingId(room.id);
    try {
      const res = await toggleRoomActiveAction(room.id, currentHomestay?.id, !room.is_active);
      if (res.success) {
        showToast("success", res.message || "Room status updated.");
        await refreshData();
      } else {
        showToast("error", res.error || "Failed to toggle status.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Error occurred.");
    } finally {
      setRoomActionLoadingId(null);
    }
  };

  const handleArchiveRoom = async (room: Room) => {
    if (!window.confirm(`Are you sure you want to archive room "${room.name}"? It will not receive new bookings, but all historical invoices and booking records remain preserved.`)) {
      return;
    }
    setRoomActionLoadingId(room.id);
    try {
      const res = await archiveRoomAction(room.id, currentHomestay?.id);
      if (res.success) {
        showToast("success", res.message || "Room archived.");
        await refreshData();
      } else {
        showToast("error", res.error || "Failed to archive room.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Error occurred.");
    } finally {
      setRoomActionLoadingId(null);
    }
  };

  const handleRestoreRoom = async (room: Room) => {
    setRoomActionLoadingId(room.id);
    try {
      const res = await restoreRoomAction(room.id, currentHomestay?.id);
      if (res.success) {
        showToast("success", res.message || "Room restored.");
        await refreshData();
      } else {
        showToast("error", res.error || "Failed to restore room.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Error occurred.");
    } finally {
      setRoomActionLoadingId(null);
    }
  };

  // -------------------------------------------------------------------------
  // 3. CHECK-IN & CHECK-OUT POLICIES STATE
  // -------------------------------------------------------------------------
  const [policiesForm, setPoliciesForm] = useState({
    check_in_time: "12:00 PM",
    check_out_time: "11:00 AM",
    early_checkin_policy: "Subject to room readiness and prior confirmation by reception.",
    late_checkout_policy: "Late check-out up to 2:00 PM available on request, subject to availability.",
    cancellation_policy: "Free cancellation up to 48 hours before check-in date. Later cancellations subject to 1-night charge.",
    child_policy: "Children under 6 stay free sharing existing bed. Extra bed available at additional charge."
  });
  const [isSavingPolicies, setIsSavingPolicies] = useState(false);

  useEffect(() => {
    if (currentHomestay) {
      setPoliciesForm(prev => ({
        check_in_time: currentHomestay.check_in_time || prev.check_in_time,
        check_out_time: currentHomestay.check_out_time || prev.check_out_time,
        early_checkin_policy: currentHomestay.early_checkin_policy || prev.early_checkin_policy,
        late_checkout_policy: currentHomestay.late_checkout_policy || prev.late_checkout_policy,
        cancellation_policy: currentHomestay.cancellation_policy || prev.cancellation_policy,
        child_policy: currentHomestay.child_policy || prev.child_policy
      }));
    }
  }, [currentHomestay]);

  const handlePoliciesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHomestay) return;
    setIsSavingPolicies(true);
    try {
      const res = await updatePoliciesAction({
        homestayId: currentHomestay.id,
        ...policiesForm
      });
      if (res.success) {
        showToast("success", res.message || "Policies saved successfully.");
      } else {
        showToast("error", res.error || "Failed to save policies.");
      }
    } catch (err: any) {
      showToast("error", err.message || "An unexpected error occurred.");
    } finally {
      setIsSavingPolicies(false);
    }
  };

  // -------------------------------------------------------------------------
  // 4. BILLING & TAX SETTINGS STATE
  // -------------------------------------------------------------------------
  const [billingForm, setBillingForm] = useState({
    currency: "INR",
    default_tax_rate: 0,
    invoice_prefix: "INV",
    accepted_payment_methods: ["cash", "upi", "bank_transfer", "card"],
    billing_name: "",
    gstin: "",
    billing_address: ""
  });
  const [isSavingBilling, setIsSavingBilling] = useState(false);

  useEffect(() => {
    if (currentHomestay) {
      setBillingForm(prev => ({
        currency: currentHomestay.currency || "INR",
        default_tax_rate: typeof currentHomestay.default_tax_rate === 'number' ? currentHomestay.default_tax_rate : prev.default_tax_rate,
        invoice_prefix: currentHomestay.invoice_prefix || "INV",
        accepted_payment_methods: currentHomestay.accepted_payment_methods || prev.accepted_payment_methods,
        billing_name: currentHomestay.billing_name || currentHomestay.name || "",
        gstin: currentHomestay.gstin || "",
        billing_address: currentHomestay.billing_address || currentHomestay.location || ""
      }));
    }
  }, [currentHomestay]);

  const handleBillingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHomestay) return;
    setIsSavingBilling(true);
    try {
      const res = await updateBillingSettingsAction({
        homestayId: currentHomestay.id,
        ...billingForm
      });
      if (res.success) {
        showToast("success", res.message || "Billing defaults updated.");
      } else {
        showToast("error", res.error || "Failed to update billing settings.");
      }
    } catch (err: any) {
      showToast("error", err.message || "An error occurred.");
    } finally {
      setIsSavingBilling(false);
    }
  };

  const togglePaymentMethod = (method: string) => {
    setBillingForm(prev => {
      const exists = prev.accepted_payment_methods.includes(method);
      return {
        ...prev,
        accepted_payment_methods: exists 
          ? prev.accepted_payment_methods.filter(m => m !== method)
          : [...prev.accepted_payment_methods, method]
      };
    });
  };

  // -------------------------------------------------------------------------
  // 5. BRANDING STATE
  // -------------------------------------------------------------------------
  const [brandingName, setBrandingName] = useState("");
  const [invoiceContact, setInvoiceContact] = useState("");
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingInvoiceLogo, setIsUploadingInvoiceLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const invoiceLogoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentHomestay) {
      setBrandingName(currentHomestay.name || "");
      setInvoiceContact(currentHomestay.invoice_contact_details || (currentHomestay.phone ? `${currentHomestay.phone} | ${currentHomestay.email || ''}` : ""));
    }
  }, [currentHomestay]);

  const handleBrandingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHomestay) return;
    setIsSavingBranding(true);
    try {
      const res = await updateBrandingSettingsAction({
        homestayId: currentHomestay.id,
        displayName: brandingName,
        invoiceContactDetails: invoiceContact
      });
      if (res.success) {
        showToast("success", res.message || "Branding updated.");
        await refreshHomestays();
      } else {
        showToast("error", res.error || "Failed to update branding.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Error occurred.");
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentHomestay) return;
    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("homestayId", currentHomestay.id);
      const res = await uploadLogoAction(formData);
      if (res.success) {
        showToast("success", "Property logo updated.");
        await refreshHomestays();
      } else {
        showToast("error", res.error || "Failed to upload logo.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Error uploading logo.");
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleLogoRemove = async () => {
    if (!currentHomestay?.logo_url) return;
    setIsUploadingLogo(true);
    try {
      const res = await removeLogoAction(currentHomestay.id);
      if (res.success) {
        showToast("success", "Logo removed.");
        await refreshHomestays();
      } else {
        showToast("error", res.error || "Failed to remove logo.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Error occurred.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleInvoiceLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentHomestay) return;
    setIsUploadingInvoiceLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("homestayId", currentHomestay.id);
      const res = await uploadInvoiceLogoAction(formData);
      if (res.success) {
        showToast("success", "Invoice logo updated.");
        await refreshHomestays();
      } else {
        showToast("error", res.error || "Failed to upload invoice logo.");
      }
    } catch (err: any) {
      showToast("error", err.message || "Error uploading invoice logo.");
    } finally {
      setIsUploadingInvoiceLogo(false);
      if (invoiceLogoInputRef.current) invoiceLogoInputRef.current.value = "";
    }
  };

  // -------------------------------------------------------------------------
  // 6. SECURITY STATE
  // -------------------------------------------------------------------------
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      showToast("error", "Current password is required.");
      return;
    }
    if (newPassword.length < 6) {
      showToast("error", "New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("error", "New passwords do not match.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const result = await changePasswordAction(currentPassword, newPassword);
      if (result.success) {
        showToast("success", "Password updated successfully.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        showToast("error", result.error || "Failed to update password.");
      }
    } catch (err: any) {
      showToast("error", err.message || "An unexpected error occurred.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-[#24213A]">Settings & Configuration</h2>
          <p className="text-[#77758F] mt-1 text-xs md:text-sm tracking-wide">
            Operational settings, room catalog, billing policies, and property preferences.
          </p>
        </div>
        {currentHomestay && (
          <div className="flex items-center gap-2 bg-[#F0EEFF] border border-[#E0DEF8] px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#5146D8]">
            <Building2 className="w-3.5 h-3.5 text-[#5146D8]" />
            <span>{currentHomestay.name}</span>
          </div>
        )}
      </div>

      {/* Global Toast Alert */}
      {toastMessage && (
        <div className={cn(
          "p-4 rounded-xl flex items-center justify-between gap-3 text-xs md:text-sm border transition-all animate-in fade-in-50",
          toastMessage.type === 'success' ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]" :
          toastMessage.type === 'error' ? "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]" :
          "bg-[#F0EEFF] border-[#E0DEF8] text-[#5146D8]"
        )}>
          <div className="flex items-center gap-2.5">
            {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="p-1 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Split Layout: Left Nav + Right Content */}
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Left Side Navigation */}
        <div className="w-full lg:w-64 flex flex-col gap-1.5 shrink-0">
          
          <button 
            onClick={() => setActiveTab('profile')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-medium transition-all duration-200 text-left cursor-pointer",
              activeTab === 'profile' 
                ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] font-bold shadow-sm" 
                : "text-[#77758F] hover:bg-[#F7F7FC] hover:text-[#24213A] border border-transparent"
            )}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>Property Profile</span>
          </button>

          <button 
            onClick={() => setActiveTab('rooms')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-medium transition-all duration-200 text-left cursor-pointer",
              activeTab === 'rooms' 
                ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] font-bold shadow-sm" 
                : "text-[#77758F] hover:bg-[#F7F7FC] hover:text-[#24213A] border border-transparent"
            )}
          >
            <DoorClosed className="w-4 h-4 shrink-0" />
            <div className="flex-1 flex items-center justify-between">
              <span>Room Configuration</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#E0DEF8] text-[#5146D8] font-bold">
                {rooms.length}
              </span>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('policies')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-medium transition-all duration-200 text-left cursor-pointer",
              activeTab === 'policies' 
                ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] font-bold shadow-sm" 
                : "text-[#77758F] hover:bg-[#F7F7FC] hover:text-[#24213A] border border-transparent"
            )}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>Check-in & Policies</span>
          </button>

          <button 
            onClick={() => setActiveTab('billing')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-medium transition-all duration-200 text-left cursor-pointer",
              activeTab === 'billing' 
                ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] font-bold shadow-sm" 
                : "text-[#77758F] hover:bg-[#F7F7FC] hover:text-[#24213A] border border-transparent"
            )}
          >
            <Receipt className="w-4 h-4 shrink-0" />
            <span>Billing & Tax Settings</span>
          </button>

          <button 
            onClick={() => setActiveTab('branding')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-medium transition-all duration-200 text-left cursor-pointer",
              activeTab === 'branding' 
                ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] font-bold shadow-sm" 
                : "text-[#77758F] hover:bg-[#F7F7FC] hover:text-[#24213A] border border-transparent"
            )}
          >
            <ImageIcon className="w-4 h-4 shrink-0" />
            <span>Branding</span>
          </button>

          <button 
            onClick={() => setActiveTab('security')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-medium transition-all duration-200 text-left cursor-pointer",
              activeTab === 'security' 
                ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] font-bold shadow-sm" 
                : "text-[#77758F] hover:bg-[#F7F7FC] hover:text-[#24213A] border border-transparent"
            )}
          >
            <Lock className="w-4 h-4 shrink-0" />
            <span>Account & Security</span>
          </button>

          <button 
            onClick={() => setActiveTab('notifications')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-medium transition-all duration-200 text-left cursor-pointer",
              activeTab === 'notifications' 
                ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] font-bold shadow-sm" 
                : "text-[#77758F] hover:bg-[#F7F7FC] hover:text-[#24213A] border border-transparent"
            )}
          >
            <Bell className="w-4 h-4 shrink-0" />
            <span>Push Notifications</span>
          </button>
        </div>

        {/* Right Side Content Panel */}
        <GlassPanel className="flex-1 p-5 md:p-8 rounded-[24px] bg-[#FFFFFF] border border-[#E8E6F2] shadow-sm">
          
          {/* ================================================================= */}
          {/* 1. PROPERTY PROFILE */}
          {/* ================================================================= */}
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h3 className="text-lg md:text-xl font-bold text-[#24213A]">Property Profile</h3>
                <p className="text-[#77758F] text-xs md:text-sm mt-0.5">
                  General hotel and homestay information displayed across reservations and guest communications.
                </p>
              </div>

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">
                    Property Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all"
                    placeholder="e.g. Wangshi Homestay"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">
                    Property Address
                  </label>
                  <input
                    type="text"
                    value={profileForm.address}
                    onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all"
                    placeholder="Street, locality, landmark"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">City</label>
                    <input
                      type="text"
                      value={profileForm.city}
                      onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all"
                      placeholder="e.g. Gangtok"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">State</label>
                    <input
                      type="text"
                      value={profileForm.state}
                      onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all"
                      placeholder="e.g. Sikkim"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">PIN Code</label>
                    <input
                      type="text"
                      value={profileForm.pincode}
                      onChange={(e) => setProfileForm({ ...profileForm, pincode: e.target.value })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all"
                      placeholder="e.g. 737101"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">Contact Phone</label>
                    <input
                      type="text"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all"
                      placeholder="e.g. +91 98765 43210"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all"
                      placeholder="e.g. reception@homestay.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">Website (Optional)</label>
                  <input
                    type="url"
                    value={profileForm.website}
                    onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all"
                    placeholder="https://yourhomestay.com"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs md:text-sm bg-[#5146D8] hover:bg-[#4338CA] text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSavingProfile ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Save Property Profile"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ================================================================= */}
          {/* 2. ROOM CONFIGURATION */}
          {/* ================================================================= */}
          {activeTab === 'rooms' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-[#24213A]">Room Configuration</h3>
                  <p className="text-[#77758F] text-xs md:text-sm mt-0.5">
                    Configure room details, nightly rates, capacity, and active status.
                  </p>
                </div>
                <button
                  onClick={handleOpenAddRoom}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5146D8] hover:bg-[#4338CA] text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add Room
                </button>
              </div>

              {/* Data Safety Notice */}
              <div className="p-3.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] flex items-start gap-3 text-xs text-[#92400E]">
                <Info className="w-4 h-4 shrink-0 text-[#D97706] mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">Financial & Historical Invariant Guard:</span>
                  <p>
                    Changing a room's nightly rate applies strictly to future bookings. All historical invoices, receipts, and past booking prices remain permanently immutable. Rooms with reservation history cannot be physically deleted; archive them to keep all records intact while disabling new bookings.
                  </p>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-2 border-b border-[#E8E6F2] pb-2">
                <button
                  onClick={() => setRoomFilterTab('active')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    roomFilterTab === 'active' 
                      ? "bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]" 
                      : "text-[#77758F] hover:text-[#24213A]"
                  )}
                >
                  Active Rooms ({rooms.filter(r => r.is_active !== false && !(r as any).is_archived).length})
                </button>
                <button
                  onClick={() => setRoomFilterTab('archived')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    roomFilterTab === 'archived' 
                      ? "bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]" 
                      : "text-[#77758F] hover:text-[#24213A]"
                  )}
                >
                  Archived / Inactive ({rooms.filter(r => r.is_active === false || (r as any).is_archived).length})
                </button>
                <button
                  onClick={() => setRoomFilterTab('all')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    roomFilterTab === 'all' 
                      ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8]" 
                      : "text-[#77758F] hover:text-[#24213A]"
                  )}
                >
                  All Rooms ({rooms.length})
                </button>
              </div>

              {/* Rooms Table */}
              <div className="overflow-x-auto hide-scrollbar border border-[#E8E6F2] rounded-2xl bg-[#FFFFFF]">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-[#E8E6F2] bg-[#F7F7FC] text-[10px] font-bold uppercase tracking-wider text-[#77758F]">
                      <th className="px-4 py-3">Room / Number</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Price / Night</th>
                      <th className="px-4 py-3">Capacity</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E6F2] text-xs">
                    {displayedRooms.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-[#77758F]">
                          No rooms found in this category.
                        </td>
                      </tr>
                    ) : (
                      displayedRooms.map((room) => {
                        const isArchived = (room as any).is_archived === true;
                        const isActionLoading = roomActionLoadingId === room.id;

                        return (
                          <tr key={room.id} className={cn("hover:bg-[#F7F7FC]/70 transition-colors", !room.is_active && "opacity-75")}>
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-[#24213A]">{room.name}</div>
                              <div className="text-[11px] text-[#77758F]">Room #{room.room_number || "—"}</div>
                            </td>
                            <td className="px-4 py-3.5 text-[#24213A]">
                              {(room as any).room_type?.trim() ? (room as any).room_type : "Unspecified"}
                            </td>
                            <td className="px-4 py-3.5 font-bold text-[#5146D8]">
                              ₹{(room.nightly_rate || room.pricePerNight || 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-4 py-3.5 text-[#24213A]">
                              {room.max_guests || room.maxCapacity} Guests
                            </td>
                            <td className="px-4 py-3.5">
                              {isArchived ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
                                  Archived
                                </span>
                              ) : room.is_active ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
                                  Active
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]">
                                  Paused
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleOpenEditRoom(room)}
                                  disabled={isActionLoading}
                                  className="p-1.5 rounded-lg border border-[#E8E6F2] hover:bg-[#F0EEFF] text-[#5146D8] transition-colors cursor-pointer"
                                  title="Edit Room"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                
                                {!isArchived && (
                                  <button
                                    onClick={() => handleToggleRoomActive(room)}
                                    disabled={isActionLoading}
                                    className="p-1.5 rounded-lg border border-[#E8E6F2] hover:bg-[#F7F7FC] text-[#77758F] transition-colors cursor-pointer"
                                    title={room.is_active ? "Deactivate / Pause" : "Activate"}
                                  >
                                    {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : room.is_active ? <Ban className="w-3.5 h-3.5 text-[#D97706]" /> : <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />}
                                  </button>
                                )}

                                {isArchived ? (
                                  <button
                                    onClick={() => handleRestoreRoom(room)}
                                    disabled={isActionLoading}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] text-[#059669] font-bold text-[10px] hover:bg-[#D1FAE5] transition-colors cursor-pointer"
                                    title="Restore Archived Room"
                                  >
                                    <RefreshCw className="w-3 h-3" /> Restore
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleArchiveRoom(room)}
                                    disabled={isActionLoading}
                                    className="p-1.5 rounded-lg border border-[#E8E6F2] hover:bg-[#FEF2F2] text-[#DC2626] transition-colors cursor-pointer"
                                    title="Archive Room"
                                  >
                                    <Archive className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* 3. CHECK-IN & CHECK-OUT POLICIES */}
          {/* ================================================================= */}
          {activeTab === 'policies' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h3 className="text-lg md:text-xl font-bold text-[#24213A]">Check-in & Check-out Policies</h3>
                <p className="text-[#77758F] text-xs md:text-sm mt-0.5">
                  Set standard operating stay schedules, grace periods, cancellation terms and guest guidelines.
                </p>
              </div>

              <form onSubmit={handlePoliciesSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">
                      Standard Check-in Time
                    </label>
                    <input
                      type="text"
                      value={policiesForm.check_in_time}
                      onChange={(e) => setPoliciesForm({ ...policiesForm, check_in_time: e.target.value })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all"
                      placeholder="e.g. 12:00 PM"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">
                      Standard Check-out Time
                    </label>
                    <input
                      type="text"
                      value={policiesForm.check_out_time}
                      onChange={(e) => setPoliciesForm({ ...policiesForm, check_out_time: e.target.value })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all"
                      placeholder="e.g. 11:00 AM"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">
                    Early Check-in Policy
                  </label>
                  <textarea
                    rows={2}
                    value={policiesForm.early_checkin_policy}
                    onChange={(e) => setPoliciesForm({ ...policiesForm, early_checkin_policy: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl p-3 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all resize-none"
                    placeholder="Rules for early arrival..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">
                    Late Check-out Policy
                  </label>
                  <textarea
                    rows={2}
                    value={policiesForm.late_checkout_policy}
                    onChange={(e) => setPoliciesForm({ ...policiesForm, late_checkout_policy: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl p-3 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all resize-none"
                    placeholder="Rules for late departures..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">
                    Cancellation & Refund Policy
                  </label>
                  <textarea
                    rows={2}
                    value={policiesForm.cancellation_policy}
                    onChange={(e) => setPoliciesForm({ ...policiesForm, cancellation_policy: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl p-3 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all resize-none"
                    placeholder="Cancellation rules and refund timelines..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">
                    Child & Extra-Guest Policy
                  </label>
                  <textarea
                    rows={2}
                    value={policiesForm.child_policy}
                    onChange={(e) => setPoliciesForm({ ...policiesForm, child_policy: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl p-3 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all resize-none"
                    placeholder="Age cutoffs and extra mattress charges..."
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingPolicies}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs md:text-sm bg-[#5146D8] hover:bg-[#4338CA] text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSavingPolicies ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Save Policies"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ================================================================= */}
          {/* 4. BILLING & TAX SETTINGS */}
          {/* ================================================================= */}
          {activeTab === 'billing' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h3 className="text-lg md:text-xl font-bold text-[#24213A]">Billing & Tax Settings</h3>
                <p className="text-[#77758F] text-xs md:text-sm mt-0.5">
                  Configure default currency, tax rates, future invoice numbering, and accepted payment modes.
                </p>
              </div>

              {/* Invariant Warning */}
              <div className="p-3.5 rounded-xl bg-[#F0EEFF] border border-[#E0DEF8] flex items-start gap-3 text-xs text-[#5146D8]">
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#5146D8] mt-0.5" />
                <div>
                  <span className="font-bold">Financial Immutability Guarantee:</span>
                  <p className="mt-0.5 text-[#24213A]">
                    Existing invoices, past payments, and settled balances are strictly immutable. Updating tax rates or invoice prefixes applies only to newly generated invoices.
                  </p>
                </div>
              </div>

              <form onSubmit={handleBillingSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">Currency</label>
                    <select
                      value={billingForm.currency}
                      onChange={(e) => setBillingForm({ ...billingForm, currency: e.target.value })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] cursor-pointer"
                    >
                      <option value="INR">INR (₹) - Indian Rupee</option>
                      <option value="USD">USD ($) - US Dollar</option>
                      <option value="EUR">EUR (€) - Euro</option>
                      <option value="GBP">GBP (£) - British Pound</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">Default Tax / GST (%)</label>
                    <select
                      value={billingForm.default_tax_rate}
                      onChange={(e) => setBillingForm({ ...billingForm, default_tax_rate: Number(e.target.value) })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] cursor-pointer"
                    >
                      <option value={0}>0% (Tax Exempt)</option>
                      <option value={5}>5% GST (Standard Homestay)</option>
                      <option value={12}>12% GST</option>
                      <option value={18}>18% GST</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">Invoice Prefix</label>
                    <input
                      type="text"
                      value={billingForm.invoice_prefix}
                      onChange={(e) => setBillingForm({ ...billingForm, invoice_prefix: e.target.value.toUpperCase() })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] transition-all font-mono"
                      placeholder="e.g. INV"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-2">Accepted Payment Methods</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: "cash", label: "Cash" },
                      { id: "upi", label: "UPI" },
                      { id: "bank_transfer", label: "Bank Transfer" },
                      { id: "card", label: "Credit/Debit Card" }
                    ].map(method => {
                      const selected = billingForm.accepted_payment_methods.includes(method.id);
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => togglePaymentMethod(method.id)}
                          className={cn(
                            "flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer",
                            selected 
                              ? "bg-[#F0EEFF] border-[#5146D8] text-[#5146D8]" 
                              : "bg-[#FFFFFF] border-[#E8E6F2] text-[#77758F] hover:bg-[#F7F7FC]"
                          )}
                        >
                          <span>{method.label}</span>
                          {selected ? <Check className="w-3.5 h-3.5 text-[#5146D8]" /> : <span className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">Billing Legal Name</label>
                    <input
                      type="text"
                      value={billingForm.billing_name}
                      onChange={(e) => setBillingForm({ ...billingForm, billing_name: e.target.value })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                      placeholder="e.g. Wangshi Homestay & Resorts LLP"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">GSTIN</label>
                    <input
                      type="text"
                      value={billingForm.gstin}
                      onChange={(e) => setBillingForm({ ...billingForm, gstin: e.target.value.toUpperCase() })}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] font-mono"
                      placeholder="e.g. 11AAAAA0000A1Z5"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingBilling}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs md:text-sm bg-[#5146D8] hover:bg-[#4338CA] text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSavingBilling ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Save Billing Settings"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ================================================================= */}
          {/* 5. BRANDING */}
          {/* ================================================================= */}
          {activeTab === 'branding' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h3 className="text-lg md:text-xl font-bold text-[#24213A]">Branding & Visual Identity</h3>
                <p className="text-[#77758F] text-xs md:text-sm mt-0.5">
                  Property logos, invoice headers, and display identity tailored for your specific homestay.
                </p>
              </div>

              {/* Property Logo */}
              <div className="p-5 rounded-2xl border border-[#E8E6F2] bg-[#F7F7FC]/50 space-y-4">
                <h4 className="text-sm font-bold text-[#24213A]">Property Logo</h4>
                <p className="text-xs text-[#77758F]">Appears on the main navigation sidebar and top navigation.</p>

                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pt-2">
                  <div className="w-24 h-24 rounded-2xl bg-[#FFFFFF] border border-[#E8E6F2] flex items-center justify-center overflow-hidden shadow-sm relative group shrink-0">
                    {currentHomestay?.logo_url ? (
                      <Image 
                        src={currentHomestay.logo_url} 
                        alt="Property Logo" 
                        fill 
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-[#77758F]" strokeWidth={1.5} />
                    )}
                    {isUploadingLogo && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-sm z-10">
                        <Loader2 className="w-5 h-5 text-[#5146D8] animate-spin" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <input 
                      type="file" 
                      accept="image/png, image/jpeg, image/webp" 
                      className="hidden" 
                      ref={logoInputRef}
                      onChange={handleLogoUpload}
                      disabled={isUploadingLogo}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={isUploadingLogo}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#5146D8] hover:bg-[#4338CA] text-white transition-all cursor-pointer"
                      >
                        <UploadCloud className="w-4 h-4" /> {currentHomestay?.logo_url ? "Replace Logo" : "Upload Logo"}
                      </button>
                      {currentHomestay?.logo_url && (
                        <button
                          onClick={handleLogoRemove}
                          disabled={isUploadingLogo}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#DC2626] hover:bg-[#FEF2F2] border border-[#FECACA] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] text-[#77758F] block">PNG, JPEG or WEBP up to 5MB. Recommended square 1:1.</span>
                  </div>
                </div>
              </div>

              {/* Invoice Logo & Contact */}
              <div className="p-5 rounded-2xl border border-[#E8E6F2] bg-[#F7F7FC]/50 space-y-4">
                <h4 className="text-sm font-bold text-[#24213A]">Invoice Header & Contact Details</h4>
                <p className="text-xs text-[#77758F]">Appears on generated PDF invoices and A4 printed folios.</p>

                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pt-2">
                  <div className="w-24 h-24 rounded-2xl bg-[#FFFFFF] border border-[#E8E6F2] flex items-center justify-center overflow-hidden shadow-sm relative group shrink-0">
                    {currentHomestay?.invoice_logo_url || currentHomestay?.logo_url ? (
                      <Image 
                        src={currentHomestay.invoice_logo_url || currentHomestay.logo_url || ""} 
                        alt="Invoice Logo" 
                        fill 
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <Receipt className="w-8 h-8 text-[#77758F]" strokeWidth={1.5} />
                    )}
                    {isUploadingInvoiceLogo && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-sm z-10">
                        <Loader2 className="w-5 h-5 text-[#5146D8] animate-spin" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <input 
                      type="file" 
                      accept="image/png, image/jpeg, image/webp" 
                      className="hidden" 
                      ref={invoiceLogoInputRef}
                      onChange={handleInvoiceLogoUpload}
                      disabled={isUploadingInvoiceLogo}
                    />
                    <button
                      onClick={() => invoiceLogoInputRef.current?.click()}
                      disabled={isUploadingInvoiceLogo}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] hover:bg-[#E0DEF8] transition-all cursor-pointer"
                    >
                      <UploadCloud className="w-4 h-4" /> Upload Dedicated Invoice Logo
                    </button>
                    <span className="text-[11px] text-[#77758F] block">Defaults to property logo if not specified.</span>
                  </div>
                </div>

                <form onSubmit={handleBrandingSubmit} className="space-y-4 pt-4 border-t border-[#E8E6F2]">
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">
                      Property Display Name
                    </label>
                    <input
                      type="text"
                      value={brandingName}
                      onChange={(e) => setBrandingName(e.target.value)}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                      placeholder="e.g. Wangshi Homestay"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">
                      Invoice Contact & Support Details
                    </label>
                    <input
                      type="text"
                      value={invoiceContact}
                      onChange={(e) => setInvoiceContact(e.target.value)}
                      className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                      placeholder="e.g. Phone: +91 98765 43210 | info@wangshihomestay.com"
                    />
                  </div>
                  <div>
                    <button
                      type="submit"
                      disabled={isSavingBranding}
                      className="px-6 py-2 rounded-xl text-xs font-bold bg-[#5146D8] hover:bg-[#4338CA] text-white transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSavingBranding ? "Saving..." : "Save Branding Text"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* 6. ACCOUNT & SECURITY */}
          {/* ================================================================= */}
          {activeTab === 'security' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg md:text-xl font-bold text-[#24213A]">Account & Security</h3>
                <p className="text-[#77758F] text-xs md:text-sm mt-0.5">
                  Update your authentication password and account credentials.
                </p>
              </div>

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                    placeholder="Enter current password"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                    placeholder="Enter new password (min. 6 characters)"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1.5">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-4 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                    placeholder="Confirm new password"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs md:text-sm bg-[#5146D8] hover:bg-[#4338CA] text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isChangingPassword ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</> : "Update Password"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ================================================================= */}
          {/* 7. PUSH NOTIFICATIONS */}
          {/* ================================================================= */}
          {activeTab === 'notifications' && (
            <NotificationSettingsTab showToast={showToast} />
          )}

        </GlassPanel>
      </div>

      {/* ===================================================================== */}
      {/* ADD / EDIT ROOM MODAL */}
      {/* ===================================================================== */}
      {isRoomModalOpen && editingRoom && (
        <GlassModal 
          isOpen={isRoomModalOpen} 
          onClose={() => { setIsRoomModalOpen(false); setEditingRoom(null); }}
          title={editingRoom.id ? "Edit Room Configuration" : "Add New Room"}
        >
          <div className="p-6 md:p-8 flex flex-col gap-5 w-full max-w-xl mx-auto overflow-hidden">
            <div>
              <h3 className="text-lg md:text-xl font-bold text-[#24213A]">
                {editingRoom.id ? "Edit Room" : "Add New Room"}
              </h3>
              <p className="text-xs text-[#77758F] mt-0.5">
                Configure room identifier, type, nightly rate, and maximum guest capacity.
              </p>
            </div>

            <form onSubmit={handleSaveRoom} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                    Room Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingRoom.name || ""}
                    onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3.5 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                    placeholder="e.g. Deluxe Mountain View"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                    Room Number / ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingRoom.room_number || ""}
                    onChange={(e) => setEditingRoom({ ...editingRoom, room_number: e.target.value })}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3.5 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                    placeholder="e.g. 101 or A-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                    Room Type
                  </label>
                  <select
                    value={(editingRoom as any).room_type || ""}
                    onChange={(e) => setEditingRoom({ ...editingRoom, room_type: e.target.value } as any)}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] cursor-pointer"
                  >
                    <option value="">Unspecified</option>
                    <option value="Standard Room">Standard Room</option>
                    <option value="Deluxe Room">Deluxe Room</option>
                    <option value="Family Suite">Family Suite</option>
                    <option value="Cottage">Cottage</option>
                    <option value="Dormitory">Dormitory</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                    Nightly Rate (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editingRoom.nightly_rate || editingRoom.pricePerNight || ""}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditingRoom({ ...editingRoom, nightly_rate: val, pricePerNight: val });
                    }}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3.5 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] font-bold"
                    placeholder="2500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                    Max Capacity *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={20}
                    value={editingRoom.max_guests || editingRoom.maxCapacity || ""}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditingRoom({ ...editingRoom, max_guests: val, maxCapacity: val });
                    }}
                    className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3.5 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                    placeholder="2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                  Bathroom Details
                </label>
                <input
                  type="text"
                  value={editingRoom.bathroom_type || "Attached toilet & bathroom"}
                  onChange={(e) => setEditingRoom({ ...editingRoom, bathroom_type: e.target.value })}
                  className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl px-3.5 py-2.5 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8]"
                  placeholder="e.g. Attached private bathroom with geyser"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#77758F] uppercase tracking-wider mb-1">
                  Room Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={editingRoom.description || ""}
                  onChange={(e) => setEditingRoom({ ...editingRoom, description: e.target.value })}
                  className="w-full bg-[#FFFFFF] border border-[#E8E6F2] rounded-xl p-3 text-xs md:text-sm text-[#24213A] outline-none focus:border-[#5146D8] resize-none"
                  placeholder="View, bed types, balcony details..."
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="room-is-active"
                  checked={editingRoom.is_active !== false}
                  onChange={(e) => setEditingRoom({ ...editingRoom, is_active: e.target.checked })}
                  className="w-4 h-4 rounded text-[#5146D8] border-[#E8E6F2] focus:ring-0 cursor-pointer"
                />
                <label htmlFor="room-is-active" className="text-xs font-medium text-[#24213A] cursor-pointer">
                  Room is active and available for reservation
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E8E6F2]">
                <button
                  type="button"
                  onClick={() => { setIsRoomModalOpen(false); setEditingRoom(null); }}
                  disabled={isSavingRoom}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#77758F] hover:bg-[#F7F7FC] border border-[#E8E6F2] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRoom}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold bg-[#5146D8] hover:bg-[#4338CA] text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSavingRoom ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : editingRoom.id ? "Save Changes" : "Create Room"}
                </button>
              </div>
            </form>
          </div>
        </GlassModal>
      )}

    </div>
  );
}
