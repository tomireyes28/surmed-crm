import { api } from './api';
import { PageResult } from './pagination';

export const medicalRecordsService = {
  getPage: async <T>(patientId: string, page: number): Promise<PageResult<T>> => {
    const { data } = await api.get<PageResult<T>>(`/medical-records/patient/${patientId}/page`, { params: { page, limit: 25 } });
    return data;
  },
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
