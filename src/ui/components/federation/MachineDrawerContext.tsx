import React, { createContext, useContext, useState, ReactNode } from 'react';
import { MachineDetailDrawer } from '../MachineDetailDrawer';

interface MachineDrawerContextType {
  openMachine: (machineId: string) => void;
  closeMachine: () => void;
  selectedMachineId: string | null;
  isOpen: boolean;
}

const MachineDrawerContext = createContext<MachineDrawerContextType | undefined>(undefined);

export const MachineDrawerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openMachine = (machineId: string) => {
    setSelectedMachineId(machineId);
    setIsOpen(true);
  };

  const closeMachine = () => {
    setIsOpen(false);
    // We keep selectedMachineId for the closing animation if any, 
    // but the drawer component handles it.
  };

  return (
    <MachineDrawerContext.Provider value={{ openMachine, closeMachine, selectedMachineId, isOpen }}>
      {children}
      <MachineDetailDrawer 
        machineId={selectedMachineId} 
        isOpen={isOpen} 
        onClose={closeMachine} 
      />
    </MachineDrawerContext.Provider>
  );
};

export const useMachineDrawer = () => {
  const context = useContext(MachineDrawerContext);
  if (!context) {
    throw new Error('useMachineDrawer must be used within a MachineDrawerProvider');
  }
  return context;
};
