import React from 'react';
import { Stethoscope } from 'lucide-react';
import { HubSidePanel } from '../../../components/HubSidePanel';
import { HubClinicalWorkspace } from '../HubClinicalWorkspacePage';
import type { VetCockpitDrawerSection } from './VetCockpitPatientPanel';

type Props = {
  open: boolean;
  encounterId: string | null;
  initialSection?: VetCockpitDrawerSection;
  onClose: () => void;
  onCompleted: () => void;
};

const VetCockpitRecordDrawer: React.FC<Props> = ({
  open,
  encounterId,
  initialSection,
  onClose,
  onCompleted,
}) => (
  <HubSidePanel
    open={open && Boolean(encounterId)}
    onClose={onClose}
    title="Prontuário"
    titleIcon={<Stethoscope size={20} aria-hidden />}
    subtitle="Atendimento clínico"
  >
    {encounterId ? (
      <HubClinicalWorkspace
        encounterId={encounterId}
        mode="drawer"
        onClose={onClose}
        onCompleted={() => {
          onCompleted();
          onClose();
        }}
        initialSection={initialSection}
        hideFinancial
      />
    ) : null}
  </HubSidePanel>
);

export default VetCockpitRecordDrawer;
