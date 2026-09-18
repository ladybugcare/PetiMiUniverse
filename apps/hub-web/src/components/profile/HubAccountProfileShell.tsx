import React, { type ReactNode } from 'react';
import './hub-account-profile.css';

type Props = {
  children: ReactNode;
};

const HubAccountProfileShell: React.FC<Props> = ({ children }) => <div className="hub-ap">{children}</div>;

export default HubAccountProfileShell;
