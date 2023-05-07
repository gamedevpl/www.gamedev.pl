import React from "react";
import Helmet from "react-helmet";

export default function PageWrapper(props: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="App">
      <Helmet>
        <title>{props.title}</title>
      </Helmet>
      {props.children}
    </div>
  );
}
