"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, LogOut, ChevronDown, Calendar as CalendarIcon, User, BedDouble, CalendarCheck } from "lucide-react";
import { format } from "date-fns";
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
  const [today, setToday] = useState<string>("");

  useEffect(() => {
    setToday(format(new Date(), "EEE, d MMM yyyy"));
  }, []);
  
  const { rooms } = useHMSContext();
  const { partner, isLoading } = useAuth();
  const supabase = createClient();
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.replace("/login");
  };

  return (
    <div className="flex flex-col w-full mb-0 md:mb-8 pb-3 md:pb-0 relative z-50 gap-4 sm:gap-6">
      
      {/* Mobile-only Header Row (Hamburger, Logo, Avatar) */}
      <div className="flex md:hidden items-center justify-between w-full pt-1 px-1">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 text-[#96928A] hover:text-[#F2EEE3] transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        
        <div className="flex flex-col items-center text-center">
          <h1 className="text-[13px] font-bold tracking-[0.15em] text-[#F5F1E8] leading-tight uppercase">Wangshi</h1>
          <h2 className="text-[9px] font-medium tracking-[0.2em] text-[#C7C3BA] mt-0.5 uppercase">Homestay</h2>
        </div>

        {!isLoading && partner ? (
          <div className="w-8 h-8 rounded-full bg-[rgba(245,158,11,0.2)] border border-[rgba(245,158,11,0.3)] flex items-center justify-center text-[#F2EEE3] font-bold text-[10px] shrink-0 shadow-[0_0_10px_rgba(245,158,11,0.1)] uppercase">
            {partner.name.substring(0, 2)}
          </div>
        ) : (
          <div className="w-8 h-8" /> /* placeholder to balance flex-between */
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between w-full gap-2 md:gap-4">
        <div className="w-full sm:max-w-md relative" ref={searchRef}>
          <div className={cn(
            "flex items-center px-4 py-2.5 md:py-2.5 rounded-full transition-all relative z-20 bg-gray-50 md:bg-[rgba(255,255,255,0.035)] border border-gray-200 md:border-[rgba(255,255,255,0.1)] shadow-none focus-within:border-gray-300 md:focus-within:border-[rgba(245,158,11,0.4)] md:focus-within:shadow-[0_0_20px_rgba(245,158,11,0.1)]",
            isOpen && "rounded-b-none border-b-transparent md:border-b-transparent shadow-none"
          )}>
          <Search className="w-4 h-4 text-gray-500 md:text-[#96928A] mr-3 shrink-0" />
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
            className="bg-transparent border-none outline-none text-sm text-gray-900 md:text-[#F5F1E8] placeholder:text-gray-400 md:placeholder:text-[#96928A] w-full tracking-wide"
          />
          <div className="hidden sm:flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium text-[#96928A] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.05)] ml-2">
            Ctrl K
          </div>
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 w-full bg-white md:bg-[rgba(20,18,17,0.85)] border border-gray-200 border-t-0 md:border-t md:border-[rgba(255,255,255,0.08)] rounded-b-2xl md:rounded-2xl overflow-hidden shadow-[0_10px_20px_rgba(0,0,0,0.05)] md:shadow-[0_20px_40px_rgba(0,0,0,0.4)] flex flex-col max-h-[60vh] md:max-h-[400px] z-50 md:backdrop-blur-xl md:mt-1">
            {!query.trim() ? (
              <div className="p-8 text-center text-gray-500 md:text-[#96928A] text-sm">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p>Type to search across rooms, guests, and bookings.</p>
              </div>
            ) : !hasResults ? (
              <div className="p-8 text-center text-gray-500 md:text-[#96928A] text-sm">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-gray-900 md:text-[#F5F1E8] font-bold md:font-medium mb-1">No results found</p>
                <p>Try searching for a room, guest or booking.</p>
              </div>
            ) : (
              <div className="overflow-y-auto hide-scrollbar py-2">
                <div className="px-3 pb-1 pt-2 text-[10px] font-bold text-gray-400 md:text-[#96928A] tracking-widest uppercase">
                  Search Results
                </div>
                
                {results.guests.length > 0 && (
                  <div className="mb-2">
                    <div className="px-3 py-1.5 text-[11px] font-bold md:font-semibold text-gray-500 md:text-[#F2EEE3]/60 tracking-wider">
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
                             isSelected ? "bg-gray-50 md:bg-[rgba(255,255,255,0.06)]" : "hover:bg-gray-50 md:hover:bg-[rgba(255,255,255,0.04)]"
                           )}
                         >
                           <div className="mt-0.5 text-gray-400 md:text-[#F2EEE3]">
                             <User className="w-4 h-4" />
                           </div>
                           <div>
                             <div className="text-sm font-bold md:font-medium text-gray-900 md:text-[#F5F1E8] truncate">
                               {room.currentBooking?.guests.map(g => g.name).join(", ")}
                             </div>
                             <div className="text-xs text-gray-500 md:text-[#96928A] mt-0.5">
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
                    <div className="px-3 py-1.5 text-[11px] font-bold md:font-semibold text-gray-500 md:text-[#F2EEE3]/60 tracking-wider">
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
                             isSelected ? "bg-gray-50 md:bg-[rgba(255,255,255,0.06)]" : "hover:bg-gray-50 md:hover:bg-[rgba(255,255,255,0.04)]"
                           )}
                         >
                           <div className="mt-0.5 text-gray-400 md:text-[#F2EEE3]">
                             <CalendarCheck className="w-4 h-4" />
                           </div>
                           <div>
                             <div className="text-sm font-bold md:font-medium text-gray-900 md:text-[#F5F1E8] truncate">
                               {room.currentBooking?.guests.map(g => g.name).join(", ")}
                             </div>
                             <div className="text-xs text-gray-500 md:text-[#96928A] mt-0.5 flex items-center gap-1.5">
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
                    <div className="px-3 py-1.5 text-[11px] font-bold md:font-semibold text-gray-500 md:text-[#F2EEE3]/60 tracking-wider">
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
                             isSelected ? "bg-gray-50 md:bg-[rgba(255,255,255,0.06)]" : "hover:bg-gray-50 md:hover:bg-[rgba(255,255,255,0.04)]"
                           )}
                         >
                           <div className="mt-0.5 text-gray-400 md:text-[#F2EEE3]">
                             <BedDouble className="w-4 h-4" />
                           </div>
                           <div className="w-full">
                             <div className="text-sm font-bold md:font-medium text-gray-900 md:text-[#F5F1E8] flex justify-between items-center w-full">
                               <span>{room.name}</span>
                               <span className="text-xs font-bold md:font-semibold text-gray-700 md:text-[#F2EEE3] bg-gray-100 md:bg-[rgba(0,0,0,0.2)] px-2 py-0.5 rounded-full">
                                 ₹{room.pricePerNight.toLocaleString("en-IN")}
                               </span>
                             </div>
                             <div className="text-xs mt-0.5 flex items-center gap-1.5">
                               <span className={room.status === "available" ? "text-[#10B981] md:text-[#4FE77B]" : "text-[#EF4444] md:text-[#FF6978]"}>
                                 {room.status === "available" ? "Available" : "Booked"}
                               </span>
                               {room.currentBooking && (
                                 <>
                                   <span className="text-[10px] text-gray-400 md:text-[#96928A]">•</span>
                                   <span className="text-gray-500 md:text-[#96928A] truncate max-w-[100px]">{room.currentBooking.guests.map(g => g.name).join(", ")}</span>
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
        <div className="hidden md:flex items-center gap-2 glass-panel-secondary px-4 py-2 rounded-full">
          <CalendarIcon className="w-3.5 h-3.5 text-[#C7C3BA]" />
          <span className="text-xs text-[#C7C3BA] font-medium tracking-wider">{today}</span>
        </div>
        
        {/* Partner Selector Pill (Desktop only) */}
        {!isLoading && partner && (
          <div className="flex items-center gap-2 glass-panel-secondary pl-1.5 pr-3 py-1.5 rounded-full cursor-pointer hover:bg-[rgba(255,255,255,0.06)] transition-all">
            <div className="w-6 h-6 rounded-full bg-[rgba(245,158,11,0.2)] border border-[rgba(245,158,11,0.3)] flex items-center justify-center text-[#F2EEE3] font-bold text-[10px] shrink-0 shadow-[0_0_10px_rgba(245,158,11,0.1)] uppercase">
              {partner.name.substring(0, 2)}
            </div>
            <span className="text-xs font-medium text-[#F5F1E8] tracking-wide">{partner.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#96928A] ml-1" />
          </div>
        )}

        {/* Logout Button (Desktop only) */}
        <button 
          onClick={handleLogout}
          className="w-9 h-9 rounded-full flex items-center justify-center glass-panel-secondary hover:bg-[rgba(255,255,255,0.06)] hover:text-white transition-all text-[#96928A]"
          title="Sign out"
        >
          <LogOut className="w-4 h-4 ml-0.5" />
        </button>
      </div>
    </div>
    </div>
  );
}
