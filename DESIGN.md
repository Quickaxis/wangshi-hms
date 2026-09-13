# Wangshi Homestay HMS - Design System & Guidelines

## 1. Core Philosophy
- **Vibe:** Premium dark interface, modern SaaS, Himalayan mountain atmosphere.
- **Simplicity:** Extremely simple, focusing on core workflows (Available vs Booked, Drag-and-Drop).
- **Aesthetic:** Heavy glassmorphism, rounded corners, soft shadows, Poppins typography.
- **No Clutter:** Avoid traditional enterprise PMS clutter, spreadsheets, or generic Bootstrap/AdminLTE looks.

## 2. Typography
- **Font Family:** Poppins (globally)
- **Weights:**
  - 400: Body text
  - 500: Labels / Navigation
  - 600: Headings
  - 700: Important Metrics
- **Style:** Clean typography, generous spacing, soft cream/white text, NO decorative fonts.

## 3. Color Palette
- **Background Atmosphere:**
  - Dark, blurred Wangshi Homestay / Himalayan mountain background.
  - Dark overlay (`#111315`, `#0B0D0F`, `#1A1C1F` mixed with opacity) to ensure readability.
- **Text Colors:**
  - Primary: `#F5F1E8`
  - Secondary: `#C7C3BA`
  - Muted: `#96928A`
  - Cream/Highlight: `#F2EEE3`
  - Dark Text (on light bg): `#22211E`
- **Status Colors:**
  - Available (Subtle Green): `#7FE39D`, `#4FE77B`
  - Booked (Subtle Rose): `#F18F9B`, `#FF6978`
- **Glassmorphism Layers:**
  - Primary Glass: `rgba(255, 255, 255, 0.075)`
  - Secondary Glass: `rgba(255, 255, 255, 0.045)`
  - Strong Glass: `rgba(255, 255, 255, 0.13)`
  - Borders: `rgba(255, 255, 255, 0.15)`

## 4. Glassmorphism Styling
- **CSS Properties:**
  ```css
  background: rgba(255, 255, 255, 0.075);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(28px) saturate(120%);
  -webkit-backdrop-filter: blur(28px) saturate(120%);
  ```
- **Depth:** Create depth using subtle inner highlights, multiple glass layers, and soft shadows. Elements should vary in transparency based on their hierarchy.

## 5. Shape & Border Radius
- **Main Panels / Layout:** 28px – 32px
- **Cards (e.g., Room Cards):** 20px – 22px
- **Small Panels / Modals:** 16px – 18px
- **Inputs:** 14px – 16px
- **Buttons / Status Badges / Pills:** 999px (fully rounded)
- **Rule:** Avoid sharp rectangular UI entirely.

## 6. Layout & Composition
- **Main Dashboard Layout:**
  - Glass Sidebar (collapsible on tablet, bottom nav on mobile)
  - Top Bar (search, date, partner selector pill, profile)
  - Header (greeting, simple instruction)
  - Small Metrics (compact glass cards updating dynamically)
  - Room Board (Two large glass columns: AVAILABLE & BOOKED)
- **Room Board Interaction:**
  - Drag and drop functionality between columns.
  - Interaction states: reduced opacity, scale-down, grabbing cursor, destination glow, smooth animations.

## 7. Component Architecture
- **AppShell:** Layout container, Sidebar, TopBar.
- **Dashboard:** StatCard, RoomBoard, DropZone, RoomColumn, RoomCard, DragHandle, RoomStatusBadge.
- **Modals:** BookingModal, ConfirmationModal, GlassModal, GlassButton, GlassInput.
- **Data Views:** Calendar, BookingTimeline, GuestList, RevenueChart, OccupancyCard.

## 8. Data & Rooms
- **Total Rooms:** 4
  - **Room 1:** Attached bath, max 3 pax, ₹2,500/night (Bread/Maggi breakfast)
  - **Room 2:** Attached bath, max 2 pax, ₹2,500/night (Breakfast included)
  - **Room 3:** Attached bath, max 3 pax, ₹2,500/night (Bread/Maggi breakfast)
  - **Room 4:** Non-attached bath, max 3 pax, ₹2,000/night (Bread/Maggi breakfast)
- **Realtime / Auth:** Supabase Realtime across partners, single source of truth.
