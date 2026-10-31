import React, { createContext, useContext, useState, ReactNode } from 'react';
import { MachineDetailDrawer } from '../MachineDetailDrawer';

export interface SelectedNodeContext {
  id: string;
  name?: string;
  company_name?: string;
  region?: string;
  country?: string;
  status?: string;
  is_active?: boolean;
  machineId?: string | null;
  machine?: any;
  machines?: any[];
  [key: string]: any;
}

interface MachineDrawerContextType {
  openMachine: (machineId: string, nodeContext?: SelectedNodeContext) => void;
  closeMachine: () => void;
  selectedMachineId: string | null;
  selectedNode: SelectedNodeContext | null;
  isOpen: boolean;
}

const MachineDrawerContext = createContext<MachineDrawerContextType | undefined>(undefined);

export const MachineDrawerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeContext | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openMachine = (machineId: string, nodeContext?: SelectedNodeContext) => {
    setSelectedMachineId(machineId);
    setSelectedNode(nodeContext || null);
    setIsOpen(true);
  };

  const closeMachine = () => {
    setIsOpen(false);
  };

  return (
    <MachineDrawerContext.Provider value={{ openMachine, closeMachine, selectedMachineId, selectedNode, isOpen }}>
      {children}
      <MachineDetailDrawer 
        machineId={selectedMachineId} 
        nodeContext={selectedNode}
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
