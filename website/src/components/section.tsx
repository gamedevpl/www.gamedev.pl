import React from "react";
import styled from "styled-components";

export default function Section({
  isTransparent = false,
  children,
}: {
  isTransparent?: boolean;
  children: React.ReactElement | React.ReactElement[];
}) {
  return (
    <SectionContent data-transparent={isTransparent}>{children}</SectionContent>
  );
}

const SectionContent = styled.section`
  border-radius: 5px;
  margin-bottom: 25px;
  color: white;
  padding: 25px 20px;

  &:not([data-transparent="true"]) {
    background-color: #1d2123;
  }
`;
