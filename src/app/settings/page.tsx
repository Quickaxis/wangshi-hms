"use client";

import { useState, useRef } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { 
  Building2, 
  Image as ImageIcon, 
  Lock, 
  UploadCloud, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Loader2
} from "lucide-react";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { uploadLogoAction, removeLogoAction, changePasswordAction } from "@/app/actions/settings";

type Tab = 'profile' | 'branding' | 'security';

export default function SettingsPage() {
  const { userProfile, homestays, selectedHomestayId, refreshHomestays } = useHMSContext();
  const currentHomestay = homestays.find(h => h.id === selectedHomestayId);
  const isAdmin = userProfile?.role === 'super_admin';

  const [activeTab, setActiveTab] = useState<Tab>('branding');
  
  // Branding State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  // Branding Handlers
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentHomestay) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size must be less than 5MB.");
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      setUploadError("Only image files are allowed.");
      return;
    }

    setUploadError("");
    setUploadSuccess("");
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("homestayId", currentHomestay.id);

      const result = await uploadLogoAction(formData);
      
      if (result.success) {
        await refreshHomestays();
        setUploadSuccess("Logo successfully uploaded.");
      } else {
        setUploadError(result.error || "Failed to upload logo.");
      }
    } catch (err: any) {
      setUploadError(err.message || "An unexpected error occurred.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogoRemove = async () => {
    if (!currentHomestay?.logo_url) return;
    
    setUploadError("");
    setUploadSuccess("");
    setIsUploading(true);
    try {
      const result = await removeLogoAction(currentHomestay.id);
      if (result.success) {
        await refreshHomestays();
        setUploadSuccess("Logo successfully removed.");
      } else {
        setUploadError(result.error || "Failed to remove logo.");
      }
    } catch (err: any) {
      setUploadError(err.message || "An unexpected error occurred.");
    } finally {
      setIsUploading(false);
    }
  };

  // Password Handlers
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage({ type: '', text: '' });

    if (!currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Current password is required.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setIsChangingPassword(true);
    try {
      const result = await changePasswordAction(currentPassword, newPassword);
      if (result.success) {
        setPasswordMessage({ type: 'success', text: 'Password successfully updated.' });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordMessage({ type: 'error', text: result.error || 'Failed to update password.' });
      }
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.message || 'An unexpected error occurred.' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto hide-scrollbar space-y-6 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-[#24213A]">Settings</h2>
          <p className="text-[#77758F] mt-1 text-xs md:text-sm tracking-wide">
            Manage your homestay profile, branding, and security.
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Nav */}
        <div className="w-full lg:w-64 flex flex-col gap-2 shrink-0">
          <button 
            onClick={() => setActiveTab('profile')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 text-left",
              activeTab === 'profile' 
                ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] font-semibold" 
                : "text-[#77758F] hover:bg-[#F7F7FC] hover:text-[#24213A] border border-transparent"
            )}
          >
            <Building2 className="w-4 h-4" /> Property Profile
          </button>
          
          <button 
            onClick={() => setActiveTab('branding')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 text-left",
              activeTab === 'branding' 
                ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] font-semibold" 
                : "text-[#77758F] hover:bg-[#F7F7FC] hover:text-[#24213A] border border-transparent"
            )}
          >
            <ImageIcon className="w-4 h-4" /> Branding
          </button>

          <button 
            onClick={() => setActiveTab('security')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 text-left",
              activeTab === 'security' 
                ? "bg-[#F0EEFF] text-[#5146D8] border border-[#E0DEF8] font-semibold" 
                : "text-[#77758F] hover:bg-[#F7F7FC] hover:text-[#24213A] border border-transparent"
            )}
          >
            <Lock className="w-4 h-4" /> Account & Security
          </button>
        </div>

        {/* Content Area */}
        <GlassPanel className="flex-1 p-6 md:p-8 rounded-[24px] bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm">
          
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-xl font-bold text-[#24213A] mb-1">Property Profile</h3>
                <p className="text-[#77758F] text-sm mb-6">Basic information about your homestay.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#77758F] mb-1">Homestay Name</label>
                  <div className="w-full bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl px-4 py-3 text-[#24213A] font-medium">
                    {currentHomestay?.name || 'Loading...'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#77758F] mb-1">Location</label>
                  <div className="w-full bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl px-4 py-3 text-[#24213A]">
                    {currentHomestay?.location || 'Not set'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#77758F] mb-1">Email</label>
                    <div className="w-full bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl px-4 py-3 text-[#24213A]">
                      {currentHomestay?.email || 'Not set'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#77758F] mb-1">Phone</label>
                    <div className="w-full bg-[#F7F7FC] border border-[#E8E7F2] rounded-xl px-4 py-3 text-[#24213A]">
                      {currentHomestay?.phone || 'Not set'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BRANDING TAB */}
          {activeTab === 'branding' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-xl font-bold text-[#24213A] mb-1">Homestay Logo</h3>
                <p className="text-[#77758F] text-sm mb-6">This logo will appear in the main navigation sidebar.</p>
              </div>

              {uploadError && (
                <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] p-4 rounded-xl flex items-start gap-3 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{uploadError}</p>
                </div>
              )}

              {uploadSuccess && (
                <div className="bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] p-4 rounded-xl flex items-start gap-3 text-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{uploadSuccess}</p>
                </div>
              )}

              <div className="flex flex-col md:flex-row items-start gap-8">
                {/* Logo Preview */}
                <div className="flex flex-col items-center gap-4">
                  <div className="w-32 h-32 rounded-full bg-[#F7F7FC] border border-[#E8E7F2] flex items-center justify-center overflow-hidden shadow-sm relative group">
                    {currentHomestay?.logo_url ? (
                      <Image 
                        src={currentHomestay.logo_url} 
                        alt="Logo" 
                        fill 
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <ImageIcon className="w-10 h-10 text-[#77758F]" strokeWidth={1} />
                    )}
                    {isUploading && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center backdrop-blur-sm z-10">
                        <Loader2 className="w-6 h-6 text-[#5146D8] animate-spin" />
                      </div>
                    )}
                  </div>
                  {currentHomestay?.logo_url && !isUploading && (
                    <button 
                      onClick={handleLogoRemove}
                      className="text-xs text-[#DC2626] hover:text-[#B91C1C] font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove Logo
                    </button>
                  )}
                </div>

                {/* Upload Action */}
                <div className="flex-1 space-y-4">
                  <p className="text-[#77758F] text-sm">
                    Upload your property's logo to customize your dashboard. We recommend a square image (1:1 ratio) in PNG or JPEG format, at least 256x256 pixels. Maximum file size is 5MB.
                  </p>
                  
                  <div>
                    <input 
                      type="file" 
                      accept="image/png, image/jpeg, image/webp" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleLogoUpload}
                      disabled={isUploading}
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className={cn(
                        "flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all shadow-sm",
                        isUploading 
                          ? "bg-[#5146D8]/50 text-white/50 cursor-not-allowed" 
                          : "bg-[#5146D8] hover:bg-[#4338CA] text-white hover:shadow-md"
                      )}
                    >
                      <UploadCloud className="w-4 h-4" /> 
                      {currentHomestay?.logo_url ? "Replace Logo" : "Upload Logo"}
                    </button>
                    {isAdmin && <p className="text-xs text-[#5146D8] mt-2">Uploading as Super Admin for {currentHomestay?.name}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECURITY TAB */}
          {activeTab === 'security' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-xl font-bold text-[#24213A] mb-1">Account & Security</h3>
                <p className="text-[#77758F] text-sm mb-6">Manage your password and security preferences.</p>
              </div>

              {passwordMessage.text && (
                <div className={cn(
                  "p-4 rounded-xl flex items-start gap-3 text-sm border",
                  passwordMessage.type === 'success' 
                    ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]" 
                    : "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
                )}>
                  {passwordMessage.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  )}
                  <p>{passwordMessage.text}</p>
                </div>
              )}

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#77758F] mb-1">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl px-4 py-3 text-[#24213A] focus:outline-none focus:border-[#5146D8] transition-all"
                    placeholder="Enter current password"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-[#77758F] mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl px-4 py-3 text-[#24213A] focus:outline-none focus:border-[#5146D8] transition-all"
                    placeholder="Enter new password"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#77758F] mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-[#FFFFFF] border border-[#E8E7F2] rounded-xl px-4 py-3 text-[#24213A] focus:outline-none focus:border-[#5146D8] transition-all"
                    placeholder="Confirm new password"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className={cn(
                      "flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 rounded-xl font-medium transition-all shadow-sm",
                      isChangingPassword
                        ? "bg-[#E8E7F2] text-[#77758F] cursor-not-allowed"
                        : "bg-[#5146D8] hover:bg-[#4338CA] text-white hover:shadow-md"
                    )}
                  >
                    {isChangingPassword ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Updating...
                      </>
                    ) : (
                      "Update Password"
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

        </GlassPanel>
      </div>
    </div>
  );
}
