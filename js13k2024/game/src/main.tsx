import {hydrate} from "preact-iso";

const root = document.getElementById('root')!;

hydrate(
    <Main />, root
);


function Main() {
  return <>
    Placeholder
  </>
}