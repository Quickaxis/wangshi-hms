import { Room } from "@/lib/types";

// Extend the Room type with an imageUrl for the frontend
export interface UI_Room extends Room {
  imageUrl: string;
}

export const roomImageMap: Record<string, string> = {
  "1": "https://images.unsplash.com/photo-1598928506311-c55dd1b1cb6a?q=80&w=1200&auto=format&fit=crop",
  "2": "https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?q=80&w=1200&auto=format&fit=crop",
  "3": "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=1200&auto=format&fit=crop",
  "4": "https://images.unsplash.com/photo-1582719478250-c89404bb8a0e?q=80&w=1200&auto=format&fit=crop",
};

export const defaultRoomImage = "https://images.unsplash.com/photo-1598928506311-c55dd1b1cb6a?q=80&w=1200&auto=format&fit=crop";

export const prototypeRooms: UI_Room[] = [
  {
    id: "cabf8119-6326-4d63-994d-3de1cdc33ddc",
    room_number: "1",
    name: "Room No. 1",
    bathroomInfo: "Attached toilet & bathroom",
    bathroom_type: "Attached toilet & bathroom",
    maxCapacity: 3,
    max_guests: 3,
    pricePerNight: 2500,
    nightly_rate: 2500,
    breakfastInfo: "Complimentary breakfast for 2 persons (Bread or Maggi)",
    breakfast_included: true,
    breakfast_details: "Complimentary breakfast for 2 persons (Bread or Maggi)",
    status: "available",
    imageUrl: roomImageMap["1"]
  },
  {
    id: "639e42e6-6421-4333-829c-14f80aed2ebd",
    room_number: "2",
    name: "Room No. 2",
    bathroomInfo: "Attached toilet & bathroom",
    bathroom_type: "Attached toilet & bathroom",
    maxCapacity: 2,
    max_guests: 2,
    pricePerNight: 2500,
    nightly_rate: 2500,
    breakfastInfo: "Complimentary breakfast included",
    breakfast_included: true,
    breakfast_details: "Complimentary breakfast included",
    status: "available",
    imageUrl: roomImageMap["2"]
  },
  {
    id: "1616ce19-da33-439f-8ce3-9aebceb2605a",
    room_number: "3",
    name: "Room No. 3",
    bathroomInfo: "Attached toilet & bathroom",
    bathroom_type: "Attached toilet & bathroom",
    maxCapacity: 3,
    max_guests: 3,
    pricePerNight: 2500,
    nightly_rate: 2500,
    breakfastInfo: "Complimentary breakfast for 2 persons (Bread or Maggi)",
    breakfast_included: true,
    breakfast_details: "Complimentary breakfast for 2 persons (Bread or Maggi)",
    status: "available",
    imageUrl: roomImageMap["3"]
  },
  {
    id: "43f18986-9dd8-4beb-a8e4-0fe27ef686af",
    room_number: "4",
    name: "Room No. 4",
    bathroomInfo: "Non-attached toilet & bathroom",
    bathroom_type: "Non-attached toilet & bathroom",
    maxCapacity: 3,
    max_guests: 3,
    pricePerNight: 2000,
    nightly_rate: 2000,
    breakfastInfo: "Complimentary breakfast for 2 persons (Bread or Maggi)",
    breakfast_included: true,
    breakfast_details: "Complimentary breakfast for 2 persons (Bread or Maggi)",
    status: "available",
    imageUrl: roomImageMap["4"]
  }
];
