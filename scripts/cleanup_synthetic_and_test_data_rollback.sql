-- ==============================================================================
-- HMS ROLLBACK SCRIPT FOR CLEANUP OF CATEGORIES A AND B
-- Restores all 22 bookings, 23 guests, and 5 booking requests
-- ==============================================================================

BEGIN;

-- Disable prevent_booking_tampering trigger temporarily if restoring
ALTER TABLE public.bookings DISABLE TRIGGER trg_prevent_booking_tampering;

-- 1. Restore bookings
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('d695585f-dc8a-435a-93f5-6207c395d15a', '639e42e6-6421-4333-829c-14f80aed2ebd', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-16', '2026-09-17', 'cancelled', 2, 2500, 2500, NULL, NULL, NULL, '2026-09-16T01:43:50.463419+00:00', '2026-09-16T01:44:08.108+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('89fe33fd-3246-4fdd-80f8-c6c7c851b897', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-16', '2026-09-17', 'cancelled', 2, 2500, 2500, NULL, NULL, NULL, '2026-09-16T01:44:23.430052+00:00', '2026-09-16T01:51:14.027+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('f76f4266-7b0d-4caf-b2aa-4f542265e358', '639e42e6-6421-4333-829c-14f80aed2ebd', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-16', '2026-09-17', 'cancelled', 2, 2500, 2500, NULL, NULL, NULL, '2026-09-16T01:59:31.697756+00:00', '2026-09-16T11:55:29.629+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('99f3e234-d768-4bbb-9d8a-0b4bb3876364', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-16', '2026-09-17', 'cancelled', 1, 2500, 2500, NULL, NULL, NULL, '2026-09-16T01:58:42.465362+00:00', '2026-09-16T11:55:33.375+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('5b77922c-7440-4777-ad02-00b71955a37c', '6cb3ed2a-dcbb-4a81-9459-0b4d815693a6', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2026-10-26', '2026-10-30', 'cancelled', 2, 1999, 7996, NULL, NULL, NULL, '2026-10-23T10:13:24.240253+00:00', '2026-10-23T10:17:14.071+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('83e885d8-6c29-4611-977a-81edd1f79995', '2d8c535a-46dc-4eb7-8128-3e5ec62da1f7', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '482e5cf3-afd5-4157-9a2f-484f261f36a0', '2026-10-11', '2026-10-12', 'cancelled', 1, 1700, 1700, 'adwawd', NULL, NULL, '2026-10-11T14:18:27.737666+00:00', '2026-10-23T10:17:22.46+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('e108d2d1-f70c-4496-b44c-7c3ed31117b8', '2b99cad0-38a9-48d7-a865-8ade65122f59', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2026-10-26', '2026-10-27', 'cancelled', 2, 1999, 1999, NULL, NULL, NULL, '2026-10-23T10:17:35.189808+00:00', '2026-10-23T10:17:43.951+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('17cb0bbb-0c6d-4f3e-af9a-ac71e195d222', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-13', '2026-09-17', 'cancelled', 1, 2500, 10000, 'Test Booking', NULL, NULL, '2026-09-13T06:05:53.540167+00:00', '2026-09-13T06:10:15.593+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb', '1616ce19-da33-439f-8ce3-9aebceb2605a', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-13', '2026-09-14', 'cancelled', 2, 2500, 2500, NULL, NULL, NULL, '2026-09-13T06:03:00.671777+00:00', '2026-09-13T06:18:37.137+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('0a064075-573e-417d-a047-1f3fadcb7308', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-13', '2026-09-14', 'cancelled', 1, 2500, 2500, NULL, NULL, NULL, '2026-09-13T06:29:53.312644+00:00', '2026-09-13T06:33:33.737+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('45ff7159-b980-41ca-8883-0a60ccb45aad', '43f18986-9dd8-4beb-a8e4-0fe27ef686af', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-13', '2026-09-14', 'cancelled', 1, 2000, 2000, NULL, NULL, NULL, '2026-09-13T07:16:52.913321+00:00', '2026-09-13T07:17:04.681+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('812660f3-a9cb-4e11-b789-1db0d3621bd2', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-14', '2026-09-16', 'cancelled', 3, 2500, 5000, 'Condoms at service', NULL, NULL, '2026-09-13T07:25:56.385771+00:00', '2026-09-13T07:26:59.281+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('1fc6d0b8-c4a9-487f-9ef4-af12eead3942', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-13', '2026-09-17', 'cancelled', 1, 2500, 10000, 'Test Booking', NULL, NULL, '2026-09-13T07:55:25.287403+00:00', '2026-09-13T08:13:12.643+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('5f067bc9-11c9-4134-b878-c5aa28be3059', '639e42e6-6421-4333-829c-14f80aed2ebd', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-13', '2026-09-14', 'cancelled', 1, 2500, 2500, NULL, NULL, NULL, '2026-09-13T08:11:27.506774+00:00', '2026-09-13T08:13:19.541+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('8360d4f8-fd9b-493f-98e5-e6177b022d18', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-20', '2026-09-21', 'cancelled', 1, 2500, 2500, 'Test note', NULL, NULL, '2026-09-13T09:10:18.538053+00:00', '2026-09-13T09:53:50.866+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('fa20ab92-29ab-4717-b84d-1e48474d79c5', '639e42e6-6421-4333-829c-14f80aed2ebd', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-09-25', '2026-09-30', 'cancelled', 1, 2500, 12500, 'Hejek', NULL, NULL, '2026-09-13T09:57:29.416783+00:00', '2026-09-13T14:03:26.914+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('76f0811f-6fd4-4fee-b112-8fa2add872c1', '6cb3ed2a-dcbb-4a81-9459-0b4d815693a6', '4c409314-e599-4255-aaff-583c6218cc7c', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2026-10-25', '2026-10-27', 'cancelled', 2, 1999, 3998, '[Direct Website Pay-at-Property Booking] WARM WATER', NULL, NULL, '2026-10-24T17:00:05.532218+00:00', '2026-10-24T17:02:30.158+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('0379a971-131b-4e0c-bff1-3ffa68dc34dc', '6cb3ed2a-dcbb-4a81-9459-0b4d815693a6', '4c409314-e599-4255-aaff-583c6218cc7c', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2026-10-25', '2026-10-26', 'cancelled', 2, 1999, 1999, '[Direct Website Pay-at-Property Booking]', NULL, NULL, '2026-10-24T17:02:49.675635+00:00', '2026-10-24T17:03:24.08+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('319329df-0709-49c9-b039-3c69e28c6a36', '2b99cad0-38a9-48d7-a865-8ade65122f59', '4c409314-e599-4255-aaff-583c6218cc7c', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2026-10-25', '2026-10-26', 'cancelled', 2, 1999, 1999, '[Direct Website Pay-at-Property Booking] Please provide warm water', NULL, NULL, '2026-10-24T16:05:31.859668+00:00', '2026-10-24T17:20:15.762+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('725b0620-811b-4d9e-b5de-f0793d887aa8', '631331f9-4f8f-4129-8cb1-681afd5ee804', '4c409314-e599-4255-aaff-583c6218cc7c', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2026-10-26', '2026-10-27', 'cancelled', 2, 1499, 1499, '[Direct Website Pay-at-Property Booking]', NULL, NULL, '2026-10-24T16:06:49.269354+00:00', '2026-10-24T17:20:34.637+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('b849cc45-e530-48ee-b7fe-e570a418b396', '2b99cad0-38a9-48d7-a865-8ade65122f59', '4c409314-e599-4255-aaff-583c6218cc7c', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2026-10-26', '2026-10-27', 'cancelled', 2, 1999, 1999, '[Direct Website Pay-at-Property Booking] Please provide warm water', NULL, NULL, '2026-10-24T15:42:46.887927+00:00', '2026-10-24T17:20:36.852+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('4f270eb0-eba4-49fd-ad92-9f71fb5dac7d', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', 'cdee6e82-11a9-4310-9de1-4404c340ec0e', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2026-10-24', '2026-10-30', 'cancelled', 1, 2500, 15000, 'Daily room rendi service needed', NULL, NULL, '2026-10-24T17:36:19.530546+00:00', '2026-10-25T02:53:51.209+00:00')
ON CONFLICT (id) DO NOTHING;

-- Re-enable prevent_booking_tampering trigger
ALTER TABLE public.bookings ENABLE TRIGGER trg_prevent_booking_tampering;

-- 2. Restore guests
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('44563196-11aa-42a2-b6de-aff5e3d90223', 'a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'oooo', '9999999999', NULL, true, '2026-09-13T06:03:01.103456+00:00', '2026-09-13T06:03:01.103456+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('ec9ea509-14e1-4fba-8c59-f5bbfd6d7bb4', 'a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'ooo', NULL, NULL, false, '2026-09-13T06:03:01.103456+00:00', '2026-09-13T06:03:01.103456+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('9e213bf2-ee88-4d41-8c65-00f4a17fb4ee', '0a064075-573e-417d-a047-1f3fadcb7308', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'Rajesh', '2222222', NULL, true, '2026-09-13T06:29:53.680146+00:00', '2026-09-13T06:29:53.680146+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('af478a87-0fd1-491a-9eb7-044e1f94b1fa', '45ff7159-b980-41ca-8883-0a60ccb45aad', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'awdawdawd', 'awdawdawdad ad', NULL, true, '2026-09-13T07:16:53.295861+00:00', '2026-09-13T07:16:53.295861+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('be0e7a03-f026-46ef-9207-47917c615a41', '812660f3-a9cb-4e11-b789-1db0d3621bd2', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'Uttaran', '8822095217', NULL, true, '2026-09-13T07:25:56.444067+00:00', '2026-09-13T07:25:56.444067+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('07c67cf3-aeba-4611-bb85-dd4e1beed42d', '812660f3-a9cb-4e11-b789-1db0d3621bd2', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'Puja', NULL, NULL, false, '2026-09-13T07:25:56.444067+00:00', '2026-09-13T07:25:56.444067+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('dab2e733-80bc-4e1c-9ea7-422f99efc0fd', '812660f3-a9cb-4e11-b789-1db0d3621bd2', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'Ekta', NULL, NULL, false, '2026-09-13T07:25:56.444067+00:00', '2026-09-13T07:25:56.444067+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('94d20567-d0ee-4af9-bd06-dd77a6ae0b34', '5f067bc9-11c9-4134-b878-c5aa28be3059', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '22222', '22222', NULL, true, '2026-09-13T08:11:27.553897+00:00', '2026-09-13T08:11:27.553897+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('f8ea3686-aee8-4720-9027-330eda2664a2', 'fa20ab92-29ab-4717-b84d-1e48474d79c5', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'Yrjr', '8474836522', NULL, true, '2026-09-13T09:57:29.483474+00:00', '2026-09-13T09:57:29.483474+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('24586028-ef9e-42d9-b2f5-c3ff0cd4e821', '99f3e234-d768-4bbb-9d8a-0b4bb3876364', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'aa', '8220952171', NULL, true, '2026-09-16T01:58:42.465362+00:00', '2026-09-16T01:58:42.465362+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('862ad9ac-654e-4cba-a24c-d0d2ade7ab3e', 'f76f4266-7b0d-4caf-b2aa-4f542265e358', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'GPT 1', '8822095217', NULL, true, '2026-09-16T01:59:31.697756+00:00', '2026-09-16T01:59:31.697756+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('0862aec8-43bb-48b8-87b9-d54ee6890cea', 'f76f4266-7b0d-4caf-b2aa-4f542265e358', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'GPT 2 \', NULL, NULL, false, '2026-09-16T01:59:31.697756+00:00', '2026-09-16T01:59:31.697756+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('be5cf40f-2767-4f17-9a14-1756f3e0a6dc', '83e885d8-6c29-4611-977a-81edd1f79995', '482e5cf3-afd5-4157-9a2f-484f261f36a0', 'awdwada', 'awdad', NULL, true, '2026-10-11T14:18:27.737666+00:00', '2026-10-11T14:18:27.737666+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('beb3098c-ccf3-4252-b675-a6f35183228d', '5b77922c-7440-4777-ad02-00b71955a37c', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'FGDRGDRG', '8822095217', NULL, true, '2026-10-23T10:13:24.240253+00:00', '2026-10-23T10:13:24.240253+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('8c0fc890-9027-4690-8c6b-7c048fd75202', '5b77922c-7440-4777-ad02-00b71955a37c', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'FFDXG', NULL, NULL, false, '2026-10-23T10:13:24.240253+00:00', '2026-10-23T10:13:24.240253+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('d840d60f-a4b0-4b25-b6dc-40bc9580d3fd', 'e108d2d1-f70c-4496-b44c-7c3ed31117b8', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'drtgdrgsd', '5676473563', NULL, true, '2026-10-23T10:17:35.189808+00:00', '2026-10-23T10:17:35.189808+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('6bf4b6d4-2139-4ea2-aa62-70c3956e283b', 'e108d2d1-f70c-4496-b44c-7c3ed31117b8', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'dffdv', NULL, NULL, false, '2026-10-23T10:17:35.189808+00:00', '2026-10-23T10:17:35.189808+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('edc5256f-9748-42d3-a24c-524f194e4d55', 'b849cc45-e530-48ee-b7fe-e570a418b396', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'Unmesh Gogoi', '8822095217', 'ugmarketing01@gmail.com', true, '2026-10-24T15:42:46.978481+00:00', '2026-10-24T15:42:46.978481+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('c0a725eb-1990-4021-a8e5-9b4bd688b462', '319329df-0709-49c9-b039-3c69e28c6a36', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'riya sharma', '9365976311', 'riyasharma2003121@gmail.com', true, '2026-10-24T16:05:31.958093+00:00', '2026-10-24T16:05:31.958093+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('79f7f170-925c-41d5-827f-a6b3b6eee9a1', '725b0620-811b-4d9e-b5de-f0793d887aa8', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'riya sharma', '8822095217', 'riyasharma2003121@gmail.com', true, '2026-10-24T16:06:49.370393+00:00', '2026-10-24T16:06:49.370393+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('60c89943-bec8-4abd-909e-90a29d442697', '76f0811f-6fd4-4fee-b112-8fa2add872c1', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'UNMESH GOGOI', '8822095217', NULL, true, '2026-10-24T17:00:05.611752+00:00', '2026-10-24T17:00:05.611752+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('05c49f4e-fcb6-4864-9f98-552d159f64e4', '0379a971-131b-4e0c-bff1-3ffa68dc34dc', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'QUICK AXIS', '93293121212', NULL, true, '2026-10-24T17:02:49.79743+00:00', '2026-10-24T17:02:49.79743+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('491bf1b3-f668-49ee-be28-2484076539d3', '4f270eb0-eba4-49fd-ad92-9f71fb5dac7d', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'Unmesh rendi', '8822095217', NULL, true, '2026-10-24T17:36:19.530546+00:00', '2026-10-24T17:36:19.530546+00:00')
ON CONFLICT (id) DO NOTHING;

-- 3. Restore booking_requests
INSERT INTO public.booking_requests (id, homestay_id, room_id, booking_id, check_in, check_out, number_of_guests, guest_name, guest_phone, guest_email, notes, estimated_total, payment_method, status, created_at, updated_at)
VALUES ('bb56da28-52e3-4143-8f23-20d796e7be8d', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2b99cad0-38a9-48d7-a865-8ade65122f59', 'b849cc45-e530-48ee-b7fe-e570a418b396', '2026-10-26', '2026-10-27', 2, 'Unmesh Gogoi', '8822095217', 'ugmarketing01@gmail.com', 'Please provide warm water', 1999, 'pay_at_property', 'approved', '2026-10-24T15:42:47.067317+00:00', '2026-10-24T15:42:47.067317+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.booking_requests (id, homestay_id, room_id, booking_id, check_in, check_out, number_of_guests, guest_name, guest_phone, guest_email, notes, estimated_total, payment_method, status, created_at, updated_at)
VALUES ('1e079301-46ec-4341-8906-1fcf40c9e192', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2b99cad0-38a9-48d7-a865-8ade65122f59', '319329df-0709-49c9-b039-3c69e28c6a36', '2026-10-25', '2026-10-26', 2, 'riya sharma', '9365976311', 'riyasharma2003121@gmail.com', 'Please provide warm water', 1999, 'pay_at_property', 'approved', '2026-10-24T16:05:32.033447+00:00', '2026-10-24T16:05:32.033447+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.booking_requests (id, homestay_id, room_id, booking_id, check_in, check_out, number_of_guests, guest_name, guest_phone, guest_email, notes, estimated_total, payment_method, status, created_at, updated_at)
VALUES ('a4844ae1-45d5-4bf2-96a4-f92a003234f5', '3356f10c-cfb7-44af-99bb-c616619bf42a', '631331f9-4f8f-4129-8cb1-681afd5ee804', '725b0620-811b-4d9e-b5de-f0793d887aa8', '2026-10-26', '2026-10-27', 2, 'riya sharma', '8822095217', 'riyasharma2003121@gmail.com', NULL, 1499, 'pay_at_property', 'approved', '2026-10-24T16:06:49.450494+00:00', '2026-10-24T16:06:49.450494+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.booking_requests (id, homestay_id, room_id, booking_id, check_in, check_out, number_of_guests, guest_name, guest_phone, guest_email, notes, estimated_total, payment_method, status, created_at, updated_at)
VALUES ('ce4fd1c2-f061-4193-a6ca-7e6e2438c3cf', '3356f10c-cfb7-44af-99bb-c616619bf42a', '6cb3ed2a-dcbb-4a81-9459-0b4d815693a6', '76f0811f-6fd4-4fee-b112-8fa2add872c1', '2026-10-25', '2026-10-27', 2, 'UNMESH GOGOI', '8822095217', NULL, 'WARM WATER', 3998, 'pay_at_property', 'approved', '2026-10-24T17:00:05.707852+00:00', '2026-10-24T17:00:05.707852+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.booking_requests (id, homestay_id, room_id, booking_id, check_in, check_out, number_of_guests, guest_name, guest_phone, guest_email, notes, estimated_total, payment_method, status, created_at, updated_at)
VALUES ('1cc19888-477e-4f36-a84f-d6a6f888cd62', '3356f10c-cfb7-44af-99bb-c616619bf42a', '6cb3ed2a-dcbb-4a81-9459-0b4d815693a6', '0379a971-131b-4e0c-bff1-3ffa68dc34dc', '2026-10-25', '2026-10-26', 2, 'QUICK AXIS', '93293121212', NULL, NULL, 1999, 'pay_at_property', 'approved', '2026-10-24T17:02:49.880448+00:00', '2026-10-24T17:02:49.880448+00:00')
ON CONFLICT (id) DO NOTHING;

COMMIT;
