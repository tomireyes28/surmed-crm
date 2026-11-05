import { api } from './api';

export const medicalRecordsService = {
  getByPatientId: async (patientId: string) => {
    const { data } = await api.get(`/medical-records/patient/${patientId}`);
    return data;
  },

  create: async (patientId: string, notes: string, file?: File | null) => {
    const formData = new FormData();
    formData.append('patientId', patientId);
    formData.append('notes', notes);

    if (file) {
      formData.append('file', file);
    }

    const { data } = await api.post('/medical-records', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },

  createAddendum: async (
    parentRecordId: string,
    notes: string,
    reason?: string,
  ) => {
    const { data } = await api.post(
      `/medical-records/${parentRecordId}/addendum`,
      {
        notes,
        reason,
      },
    );
    return data;
  },
};
