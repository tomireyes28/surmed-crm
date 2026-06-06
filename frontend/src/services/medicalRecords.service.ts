import { api } from './api';

export const medicalRecordsService = {
  // Trae todas las evoluciones de un paciente específico
  getByPatientId: async (patientId: string) => {
    const { data } = await api.get(`/medical-records/patient/${patientId}`);
    return data;
  },

  // Crea una nueva nota (preparado con FormData para cuando le sumemos archivos en el Día 5)
  create: async (patientId: string, notes: string) => {
    const formData = new FormData();
    formData.append('patientId', patientId);
    formData.append('notes', notes);
    
    const { data } = await api.post('/medical-records', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  }
};