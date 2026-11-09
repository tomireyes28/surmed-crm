CREATE INDEX "medical_records_patientId_createdAt_id_idx" ON "medical_records"("patientId", "createdAt", "id");
CREATE INDEX "products_isActive_category_name_id_idx" ON "products"("isActive", "category", "name", "id");
CREATE INDEX "appointments_date_id_idx" ON "appointments"("date", "id");
