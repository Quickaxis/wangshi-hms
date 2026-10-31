"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, LogOut, ChevronDown, Calendar as CalendarIcon, User, BedDouble, CalendarCheck } from "lucide-react";
import { format } from "date-fns";
import { usePathname, useRouter } from "next/navigation";
import { useHMSContext } from "../providers/HMSProvider";
import { useAuth } from "../providers/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { UI_Room } from "@/data/rooms";
import { Room } from "@/lib/types";
import { cn } from "@/lib/utils";
interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [today, setToday] = useState<string>("");

  useEffect(() => {
    setToday(format(new Date(), "EEE, d MMM yyyy"));
  }, []);
  
  const { rooms, userProfile, homestays, selectedHomestayId, setSelectedHomestayId } = useHMSContext();
  const { partner, isLoading } = useAuth();
  
  // Create supabase client only when needed for logout
  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  };
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Live search filtering
  const results = useMemo(() => {
    const trimmedQuery = debouncedQuery.trim().toLowerCase();
    if (!trimmedQuery) return { rooms: [], guests: [], bookings: [] };

    const matchedRooms: UI_Room[] = [];
    const matchedGuests: UI_Room[] = [];
    const matchedBookings: UI_Room[] = [];

    rooms.forEach((room) => {
      let isRoomMatch = false;
      
      // Match Rooms
      if (
        room.name.toLowerCase().includes(trimmedQuery) ||
        room.status.toLowerCase().includes(trimmedQuery) ||
        room.pricePerNight.toString().includes(trimmedQuery)
      ) {
        matchedRooms.push(room);
        isRoomMatch = true;
      }

      // Match Bookings / Guests
      if (room.currentBooking) {
        const { guests, guestPhone, checkIn, checkOut, bookingAmount } = room.currentBooking;
        const guestNamesStr = guests.map(g => g.name).join(" ");
        const bookingMatchStr = `${guestNamesStr} ${guestPhone || ""} ${checkIn} ${checkOut} ${bookingAmount}`.toLowerCase();
        
        if (guestNamesStr.toLowerCase().includes(trimmedQuery) || (guestPhone && guestPhone.includes(trimmedQuery))) {
          matchedGuests.push(room);
        } else if (bookingMatchStr.includes(trimmedQuery)) {
          matchedBookings.push(room);
        } else if (!isRoomMatch && room.name.toLowerCase().includes(trimmedQuery)) {
          // If searching for "Room 3" and it's booked, we can also show it in bookings for convenience
          matchedBookings.push(room);
        }
      }
    });

    return { rooms: matchedRooms, guests: matchedGuests, bookings: matchedBookings };
  }, [query, rooms]);

  const allResults = useMemo(() => {
    return [
      ...results.guests.map(r => ({ type: "guest" as const, room: r })),
      ...results.bookings.map(r => ({ type: "booking" as const, room: r })),
      ...results.rooms.map(r => ({ type: "room" as const, room: r }))
    ];
  }, [results]);

  // Keyboard navigation inside dropdown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(allResults.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + allResults.length) % Math.max(allResults.length, 1));
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (allResults.length > 0 && allResults[selectedIndex]) {
          handleResultClick(allResults[selectedIndex].room);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, allResults, selectedIndex]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  const handleResultClick = (room: Room) => {
    setIsOpen(false);
    setQuery("");
    inputRef.current?.blur();
    
    // Dispatch custom event to open modal in RoomBoard
    const event = new CustomEvent("openViewDetails", { detail: room });
    window.dispatchEvent(event);
  };

  const hasResults = allResults.length > 0;

  // handleLogout is defined above

  return (
    <div className="flex flex-col w-full mb-0 md:mb-8 pb-1.5 md:pb-0 relative z-50 gap-2.5 sm:gap-4 md:gap-6">
      
      {/* Mobile-only Header Row (Hamburger, Logo, Avatar) */}
      <div className="flex md:hidden items-center justify-between w-full pt-0.5 px-1">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 text-[#77758F] hover:text-[#24213A] transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        
        <div className="flex flex-col items-center text-center">
          <h1 className="text-[13px] font-bold tracking-[0.15em] text-[#24213A] leading-tight uppercase">
            {(homestays.filter(h => h.is_active).find(h => h.id === selectedHomestayId)?.name || homestays.find(h => h.is_active)?.name || "Wangshi").split(' ')[0]}
          </h1>
          <h2 className="text-[9px] font-medium tracking-[0.2em] text-[#77758F] mt-0.5 uppercase">
            {(homestays.filter(h => h.is_active).find(h => h.id === selectedHomestayId)?.name || homestays.find(h => h.is_active)?.name || "Homestay").split(' ').slice(1).join(' ')}
          </h2>
        </div>

        {!isLoading && partner ? (
          <div className="w-8 h-8 rounded-full bg-[#F0EEFF] border border-[#E0DEF8] flex items-center justify-center text-[#5146D8] font-bold text-[10px] shrink-0 shadow-sm uppercase">
            {partner.name.substring(0, 2)}
          </div>
        ) : (
          <div className="w-8 h-8" /> /* placeholder to balance flex-between */
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between w-full gap-2 md:gap-4">
        <div className="w-full sm:max-w-md relative" ref={searchRef}>
          <div className={cn(
            "flex items-center px-4 py-2.5 md:py-2.5 rounded-full transition-all relative z-20 bg-[#FFFFFF] border border-[#E8E7F2] shadow-sm focus-within:border-[#5146D8] focus-within:shadow-[0_0_20px_rgba(81,70,216,0.1)]",
            isOpen && "rounded-b-none border-b-transparent shadow-none"
          )}>
          <Search className="w-4 h-4 text-[#77758F] mr-3 shrink-0" />
          <input 
            ref={inputRef}
            type="text" 
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Search guests, bookings or rooms..." 
            className="bg-transparent border-none outline-none text-sm text-[#24213A] placeholder:text-[#8F8CA4] w-full tracking-wide"
          />
          <div className="hidden sm:flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium text-[#77758F] bg-[#F7F7FC] border border-[#E8E7F2] ml-2">
            Ctrl K
          </div>
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 w-full bg-[#FFFFFF] border border-[#E8E7F2] rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(36,33,58,0.12)] flex flex-col max-h-[60vh] sm:max-h-[400px] z-50 backdrop-blur-xl mt-1">
            {!query.trim() ? (
              <div className="p-8 text-center text-[#77758F] text-sm">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-30 text-[#8B83F6]" />
                <p>Type to search across rooms, guests, and bookings.</p>
              </div>
            ) : !hasResults ? (
              <div className="p-8 text-center text-[#77758F] text-sm">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-30 text-[#8B83F6]" />
                <p className="text-[#24213A] font-medium mb-1">No results found</p>
                <p>Try searching for a room, guest or booking.</p>
              </div>
            ) : (
              <div className="overflow-y-auto hide-scrollbar py-2">
                <div className="px-3 pb-1 pt-2 text-[10px] font-bold text-[#77758F] tracking-widest uppercase">
                  Search Results
                </div>
                
                {results.guests.length > 0 && (
                  <div className="mb-2">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-[#77758F] tracking-wider">
                      GUESTS
                    </div>
                    {results.guests.map((room, idx) => {
                      const globalIdx = allResults.findIndex(r => r.room.id === room.id && r.type === "guest");
                      const isSelected = selectedIndex === globalIdx;
                      return (
                         <div 
                           key={`guest-${room.id}`}
                           onClick={() => handleResultClick(room)}
                           className={cn(
                             "mx-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all flex items-start gap-3",
                             isSelected ? "bg-[#F0EEFF] text-[#5146D8]" : "hover:bg-[#F7F7FC]"
                           )}
                         >
                           <div className="mt-0.5 text-[#5146D8]">
                             <User className="w-4 h-4" />
                           </div>
                           <div>
                             <div className="text-sm font-medium text-[#24213A] truncate">
                               {room.currentBooking?.guests.map(g => g.name).join(", ")}
                             </div>
                             <div className="text-xs text-[#77758F] mt-0.5">
                               Guest · {room.name} {room.currentBooking?.guests ? `· ${room.currentBooking.guests.length} guests` : ""}
                             </div>
                           </div>
                         </div>
                       );
                     })}
                  </div>
                )}

                {results.bookings.length > 0 && (
                  <div className="mb-2">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-[#77758F] tracking-wider">
                      BOOKINGS
                    </div>
                    {results.bookings.map((room) => {
                      const globalIdx = allResults.findIndex(r => r.room.id === room.id && r.type === "booking");
                      const isSelected = selectedIndex === globalIdx;
                      return (
                         <div 
                           key={`booking-${room.id}`}
                           onClick={() => handleResultClick(room)}
                           className={cn(
                             "mx-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all flex items-start gap-3",
                             isSelected ? "bg-[#F0EEFF] text-[#5146D8]" : "hover:bg-[#F7F7FC]"
                           )}
                         >
                           <div className="mt-0.5 text-[#5146D8]">
                             <CalendarCheck className="w-4 h-4" />
                           </div>
                           <div>
                             <div className="text-sm font-medium text-[#24213A] truncate">
                               {room.currentBooking?.guests.map(g => g.name).join(", ")}
                             </div>
                             <div className="text-xs text-[#77758F] mt-0.5 flex items-center gap-1.5">
                               <span>{room.name}</span>
                               <span className="text-[10px]">•</span>
                               <span>{room.currentBooking?.checkIn} → {room.currentBooking?.checkOut}</span>
                             </div>
                           </div>
                         </div>
                       );
                     })}
                  </div>
                )}

                {results.rooms.length > 0 && (
                  <div className="mb-2">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-[#77758F] tracking-wider">
                      ROOMS
                    </div>
                    {results.rooms.map((room) => {
                      const globalIdx = allResults.findIndex(r => r.room.id === room.id && r.type === "room");
                      const isSelected = selectedIndex === globalIdx;
                      return (
                         <div 
                           key={`room-${room.id}`}
                           onClick={() => handleResultClick(room)}
                           className={cn(
                             "mx-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all flex items-start gap-3",
                             isSelected ? "bg-[#F0EEFF] text-[#5146D8]" : "hover:bg-[#F7F7FC]"
                           )}
                         >
                           <div className="mt-0.5 text-[#5146D8]">
                             <BedDouble className="w-4 h-4" />
                           </div>
                           <div className="w-full">
                             <div className="text-sm font-medium text-[#24213A] flex justify-between items-center w-full">
                               <span>{room.name}</span>
                               <span className="text-xs font-semibold text-[#5146D8] bg-[#F0EEFF] px-2 py-0.5 rounded-full border border-[#E0DEF8]">
                                 ₹{room.pricePerNight.toLocaleString("en-IN")}
                               </span>
                             </div>
                             <div className="text-xs mt-0.5 flex items-center gap-1.5">
                               <span
                                className={
                                  room.is_active === false
                                    ? "text-[#77758F]"
                                    : room.status === "available"
                                    ? "text-[#059669]"
                                    : "text-[#DC2626]"
                                }
                              >
                                {room.is_active === false ? "Inactive" : room.status === "available" ? "Available" : "Booked"}
                              </span>
                               {room.currentBooking && (
                                 <>
                                   <span className="text-[10px] text-[#77758F]">•</span>
                                   <span className="text-[#77758F] truncate max-w-[100px]">{room.currentBooking.guests.map(g => g.name).join(", ")}</span>
                                 </>
                               )}
                             </div>
                           </div>
                         </div>
                       );
                     })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="hidden md:flex items-center justify-end gap-3 w-full sm:w-auto">
        {/* Date Pill */}
        <div className="hidden md:flex items-center gap-2 glass-panel-secondary px-4 py-2 rounded-full border border-[#E8E7F2]">
          <CalendarIcon className="w-3.5 h-3.5 text-[#5146D8]" />
          <span className="text-xs text-[#24213A] font-medium tracking-wider">{today}</span>
        </div>
        
        {/* Partner Selector / Homestay Selector */}
        {!isLoading && partner && userProfile?.role === 'super_admin' ? (
          <div className="flex items-center gap-2 glass-panel-secondary px-3 py-1.5 rounded-full border border-[#E8E7F2]">
            <select
              value={
                homestays.filter(h => h.is_active).some(h => h.id === selectedHomestayId)
                  ? (selectedHomestayId || "")
                  : (homestays.filter(h => h.is_active)[0]?.id || "")
              }
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedHomestayId(newId);
                if (pathname.startsWith('/admin/homestays/')) {
                  const parts = pathname.split('/');
                  if (parts.length >= 4) {
                    parts[3] = newId;
                    router.push(parts.join('/'));
                  }
                }
              }}
              className="bg-transparent border-none outline-none text-xs font-medium text-[#24213A] tracking-wide focus:ring-0 cursor-pointer"
            >
              {homestays.filter(h => h.is_active).map((h) => (
                <option key={h.id} value={h.id} className="text-[#24213A] bg-white">
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        ) : !isLoading && partner ? (
          <div className="flex items-center gap-2 glass-panel-secondary pl-1.5 pr-3 py-1.5 rounded-full cursor-pointer hover:bg-[#F0EEFF] border border-[#E8E7F2] transition-all">
            <div className="w-6 h-6 rounded-full bg-[#F0EEFF] border border-[#E0DEF8] flex items-center justify-center text-[#5146D8] font-bold text-[10px] shrink-0 shadow-sm uppercase">
              {partner.name.substring(0, 2)}
            </div>
            <span className="text-xs font-medium text-[#24213A] tracking-wide">{partner.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#77758F] ml-1" />
          </div>
        ) : null}

        {/* Logout Button (Desktop only) */}
        <button 
          onClick={handleLogout}
          className="w-9 h-9 rounded-full flex items-center justify-center glass-panel-secondary border border-[#E8E7F2] hover:bg-[#F0EEFF] hover:text-[#5146D8] transition-all text-[#77758F]"
          title="Sign out"
        >
          <LogOut className="w-4 h-4 ml-0.5" />
        </button>
      </div>
    </div>
    </div>
  );
}


