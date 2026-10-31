-- ==============================================================================
-- ROLLBACK SCRIPT FOR CONCLAVE BOOKINGS CLEANUP
-- Homestay: THE CONCLAVE — LODGING AND HOMESTAY (3356f10c-cfb7-44af-99bb-c616619bf42a)
-- Generated: 2026-10-27T17:13:23.152Z
-- ==============================================================================

BEGIN;

ALTER TABLE public.bookings DISABLE TRIGGER trg_prevent_booking_tampering;

-- 1. Restore Conclave Bookings
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('3a58afb2-eb9d-45b7-afe9-46235fae5278', '2b99cad0-38a9-48d7-a865-8ade65122f59', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2026-10-23', '2026-10-24', 'checked_out', 2, 1999, 1999, NULL, NULL, NULL, '2026-10-23T10:11:43.824391+00:00', '2026-10-23T10:12:09.207+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('5b77922c-7440-4777-ad02-00b71955a37c', '6cb3ed2a-dcbb-4a81-9459-0b4d815693a6', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2026-10-26', '2026-10-30', 'cancelled', 2, 1999, 7996, NULL, NULL, NULL, '2026-10-23T10:13:24.240253+00:00', '2026-10-23T10:17:14.071+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, room_id, partner_id, homestay_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, check_in_time, check_out_time, created_at, updated_at)
VALUES ('e108d2d1-f70c-4496-b44c-7c3ed31117b8', '2b99cad0-38a9-48d7-a865-8ade65122f59', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2026-10-26', '2026-10-27', 'cancelled', 2, 1999, 1999, NULL, NULL, NULL, '2026-10-23T10:17:35.189808+00:00', '2026-10-23T10:17:43.951+00:00')
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
VALUES ('1023fa16-1fd6-4d12-9273-d4cdb2e015f2', '631331f9-4f8f-4129-8cb1-681afd5ee804', '4c409314-e599-4255-aaff-583c6218cc7c', '3356f10c-cfb7-44af-99bb-c616619bf42a', '2026-10-26', '2026-10-27', 'checked_out', 1, 1499, 1499, NULL, NULL, NULL, '2026-10-26T11:26:29.258177+00:00', '2026-10-27T15:31:55.147+00:00')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.bookings ENABLE TRIGGER trg_prevent_booking_tampering;

-- 2. Restore Conclave Guests
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('a3d9fe80-44be-4470-8032-588fb1f0fb86', '3a58afb2-eb9d-45b7-afe9-46235fae5278', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'ANURAG', '8822095217', NULL, true, '2026-10-23T10:11:43.824391+00:00', '2026-10-23T10:11:43.824391+00:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guests (id, booking_id, homestay_id, name, phone, email, is_primary, created_at, updated_at)
VALUES ('ad02a94c-9c58-47c4-8692-a251bae3a3e9', '3a58afb2-eb9d-45b7-afe9-46235fae5278', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'HIRESH', NULL, NULL, false, '2026-10-23T10:11:43.824391+00:00', '2026-10-23T10:11:43.824391+00:00')
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
VALUES ('a810d7a8-089c-4240-8212-12644acb2cdc', '1023fa16-1fd6-4d12-9273-d4cdb2e015f2', '3356f10c-cfb7-44af-99bb-c616619bf42a', 'Anamika', '8134994167', NULL, true, '2026-10-26T11:26:29.258177+00:00', '2026-10-26T11:26:29.258177+00:00')
ON CONFLICT (id) DO NOTHING;

-- 3. Restore Conclave Booking Requests
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
