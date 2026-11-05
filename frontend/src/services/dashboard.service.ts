import { api } from './api';

export interface DashboardKpis {
  totalPatients: number;
  monthlyRevenue: number | null;
  monthlyPending?: number | null;
  monthlyIssued?: number | null;
}

export interface DashboardAppointment {
  id: string;
  date: string;
  status:
    | 'PENDING'
    | 'CONFIRMED'
    | 'IN_WAITING_ROOM'
    | 'ATTENDED'
    | 'CANCELLED';
  patient: {
    firstName: string;
    lastName: string;
  };
  doctor: {
    name: string;
  };
  specialty: {
    name: string;
  };
}

export interface DashboardLowStock {
  id: string;
  name: string;
  quantity: number;
  minStock: number;
}

export const dashboardService = {
  getKpis: async (): Promise<DashboardKpis> => {
    const { data } = await api.get<DashboardKpis>('/dashboard-stats/kpis');
    return data;
  },

  getTodayAppointments: async (): Promise<DashboardAppointment[]> => {
    const { data } = await api.get<DashboardAppointment[]>(
      '/dashboard-stats/today-appointments',
    );
    return data;
  },

  getLowStock: async (): Promise<DashboardLowStock[]> => {
    const { data } = await api.get<DashboardLowStock[]>(
      '/dashboard-stats/low-stock',
    );
    return data;
  },
};
