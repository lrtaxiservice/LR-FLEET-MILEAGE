-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'KM_USER', 'FUEL_USER', 'DOCS_USER', 'VIEWER');

-- CreateEnum
CREATE TYPE "Ownership" AS ENUM ('COMPANY', 'VENDOR', 'OFFICER', 'PERSONAL');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'CNG_PETROL', 'CNG', 'ELECTRIC');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('COMMERCIAL', 'PRIVATE');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'WORKSHOP', 'IDLE', 'SOLD');

-- CreateEnum
CREATE TYPE "KmSource" AS ENUM ('UPLOAD', 'MANUAL');

-- CreateEnum
CREATE TYPE "CorrectionType" AS ENUM ('FUEL_EDIT', 'FUEL_DELETE', 'KM_EDIT', 'KM_DELETE', 'KM_REPLACE');

-- CreateEnum
CREATE TYPE "CorrectionState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "fuel_type" "FuelType" NOT NULL,
    "model_year" INTEGER,
    "ownership" "Ownership" NOT NULL,
    "category" "Category",
    "department" TEXT,
    "vendor_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_status_history" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "status" "VehicleStatus" NOT NULL,
    "place" TEXT,
    "from_date" DATE NOT NULL,
    "to_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_driver_history" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "govt" BOOLEAN NOT NULL DEFAULT false,
    "from_date" DATE NOT NULL,
    "to_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_driver_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "km_uploads" (
    "id" SERIAL NOT NULL,
    "file_name" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "user_id" INTEGER NOT NULL,
    "rows_saved" INTEGER NOT NULL DEFAULT 0,
    "rows_skipped" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMP(3),
    "undone_by_id" INTEGER,

    CONSTRAINT "km_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_km" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "km" DECIMAL(10,2) NOT NULL,
    "source" "KmSource" NOT NULL,
    "upload_id" INTEGER,
    "entered_by_id" INTEGER NOT NULL,
    "prev_km" DECIMAL(10,2),
    "prev_upload_id" INTEGER,
    "prev_source" "KmSource",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_km_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_entries" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "petrol_l" DECIMAL(10,2),
    "diesel_l" DECIMAL(10,2),
    "cng_kg" DECIMAL(10,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "bill_no" TEXT,
    "station" TEXT,
    "remarks" TEXT,
    "entered_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_requests" (
    "id" SERIAL NOT NULL,
    "type" "CorrectionType" NOT NULL,
    "state" "CorrectionState" NOT NULL DEFAULT 'PENDING',
    "target_id" INTEGER,
    "payload" JSONB NOT NULL,
    "reason" TEXT,
    "requested_by" INTEGER NOT NULL,
    "decided_by" INTEGER,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip" TEXT,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "IDX_session_expire" ON "session"("expire");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_phone_key" ON "drivers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_name_contact_key" ON "vendors"("name", "contact");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_number_key" ON "vehicles"("number");

-- CreateIndex
CREATE INDEX "vehicle_status_history_vehicle_id_from_date_idx" ON "vehicle_status_history"("vehicle_id", "from_date");

-- CreateIndex
CREATE INDEX "vehicle_driver_history_vehicle_id_from_date_idx" ON "vehicle_driver_history"("vehicle_id", "from_date");

-- CreateIndex
CREATE INDEX "vehicle_driver_history_driver_id_idx" ON "vehicle_driver_history"("driver_id");

-- CreateIndex
CREATE INDEX "daily_km_date_idx" ON "daily_km"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_km_vehicle_id_date_key" ON "daily_km"("vehicle_id", "date");

-- CreateIndex
CREATE INDEX "fuel_entries_vehicle_id_from_date_idx" ON "fuel_entries"("vehicle_id", "from_date");

-- CreateIndex
CREATE INDEX "fuel_entries_from_date_to_date_idx" ON "fuel_entries"("from_date", "to_date");

-- CreateIndex
CREATE INDEX "correction_requests_state_idx" ON "correction_requests"("state");

-- CreateIndex
CREATE INDEX "activity_log_at_idx" ON "activity_log"("at");

-- CreateIndex
CREATE INDEX "activity_log_entity_entity_id_idx" ON "activity_log"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_status_history" ADD CONSTRAINT "vehicle_status_history_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_driver_history" ADD CONSTRAINT "vehicle_driver_history_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_driver_history" ADD CONSTRAINT "vehicle_driver_history_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "km_uploads" ADD CONSTRAINT "km_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "km_uploads" ADD CONSTRAINT "km_uploads_undone_by_id_fkey" FOREIGN KEY ("undone_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_km" ADD CONSTRAINT "daily_km_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_km" ADD CONSTRAINT "daily_km_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "km_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_km" ADD CONSTRAINT "daily_km_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_entries" ADD CONSTRAINT "fuel_entries_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_entries" ADD CONSTRAINT "fuel_entries_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The activity log is append-only: block every UPDATE, DELETE and TRUNCATE.
CREATE FUNCTION activity_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_log_no_change
  BEFORE UPDATE OR DELETE ON "activity_log"
  FOR EACH ROW EXECUTE FUNCTION activity_log_append_only();

CREATE TRIGGER activity_log_no_truncate
  BEFORE TRUNCATE ON "activity_log"
  FOR EACH STATEMENT EXECUTE FUNCTION activity_log_append_only();
