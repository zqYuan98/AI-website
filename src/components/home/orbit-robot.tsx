import { useId } from "react";
import { orbitAction, type OrbitState } from "./orbit-motion";
import styles from "./orbit-robot.module.css";

export function OrbitRobot({ state, onToggle }: { state: OrbitState; onToggle: () => void }) {
  const id = useId();
  const active = state.ready && !state.unavailable;
  const action = orbitAction(state);
  const graphic = <span className={styles.float}><svg viewBox="0 0 144 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                  <linearGradient id={`${id}-porcelain`} x1="29" y1="23" x2="122" y2="120" gradientUnits="userSpaceOnUse"><stop stopColor="white"/><stop offset=".45" stopColor="#F5FAFF"/><stop offset=".8" stopColor="#DCE9FB"/><stop offset="1" stopColor="#ADC7EE"/></linearGradient>
                  <linearGradient id={`${id}-face`} x1="39" y1="43" x2="109" y2="90" gradientUnits="userSpaceOnUse"><stop stopColor="#284A83"/><stop offset=".44" stopColor="#102953"/><stop offset="1" stopColor="#08152E"/></linearGradient>
                  <linearGradient id={`${id}-glint`} x1="35" y1="44" x2="66" y2="72" gradientUnits="userSpaceOnUse"><stop stopColor="white" stopOpacity=".19"/><stop offset="1" stopColor="white" stopOpacity="0"/></linearGradient>
                  <linearGradient id={`${id}-body`} x1="47" y1="105" x2="86" y2="143" gradientUnits="userSpaceOnUse"><stop stopColor="#EDF5FF"/><stop offset=".55" stopColor="white"/><stop offset="1" stopColor="#C3D8F7"/></linearGradient>
                </defs>
                <g>
                  <path d="M43 114C33 115 27 123 27 129C27 133 32 134 36 130L47 120" fill="#D0E3FF" stroke="#A4C4F1" strokeWidth="1.5"/>
                  <path d="M102 114C112 115 118 123 118 129C118 133 113 134 109 130L98 120" fill="#D0E3FF" stroke="#A4C4F1" strokeWidth="1.5"/>
                  <path d="M44 110C48 106 95 106 101 110L95 133C91 145 54 145 49 133L44 110Z" fill={`url(#${id}-body)`} stroke="#B7CEF0" strokeWidth="1.3"/>
                  <path d="M55 137L50 145M90 137L96 145" stroke="#A9C8F2" strokeWidth="7" strokeLinecap="round"/>
                  <path d="M62 122V129M62 122L69 129V122M75 122L79 129L83 122" stroke="#789BCE" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                  <g className={styles["robot-head"]}>
                    <path d="M72 26V15" stroke="#A4C5F1" strokeWidth="3"/>
                    <circle className={styles["robot-light"]} cx="72" cy="12" r="5" fill="#5C9FFF"/>
                    <circle cx="70.6" cy="10.6" r="1.6" fill="white" fillOpacity=".8"/>
                    <rect x="9" y="54" width="15" height="27" rx="7.5" fill="#D6E7FF" stroke="#A8C8F3" strokeWidth="1.3"/>
                    <rect x="120" y="54" width="15" height="27" rx="7.5" fill="#D6E7FF" stroke="#A8C8F3" strokeWidth="1.3"/>
                    <path d="M17 61V73M127 61V73" stroke="#80ACE9" strokeWidth="2" strokeLinecap="round"/>
                    <rect x="18" y="23" width="108" height="86" rx="35" fill={`url(#${id}-porcelain)`} stroke="#AFCBF0" strokeWidth="1.4"/>
                    <path d="M29 43C38 27 55 28 72 28C89 28 109 29 116 43" stroke="white" strokeWidth="3" strokeLinecap="round" opacity=".85"/>
                    <rect x="27" y="40" width="90" height="51" rx="23" fill={`url(#${id}-face)`} stroke="#7FA7DB" strokeWidth="1.2"/>
                    <path d="M33 61C35 47 41 44 55 44H83C64 50 51 63 42 81C35 79 32 71 33 61Z" fill={`url(#${id}-glint)`}/>
                    <g className={styles["open-eyes"]}><g className={styles["robot-look"]}>
                      <rect x="49" y="54" width="11" height="19" rx="5.5" fill="#82CCFF"/>
                      <rect x="84" y="54" width="11" height="19" rx="5.5" fill="#82CCFF"/>
                      <rect x="50.8" y="55" width="3" height="7" rx="1.5" fill="#D4F5FF"/>
                      <rect x="85.8" y="55" width="3" height="7" rx="1.5" fill="#D4F5FF"/>
                      <path d="M67 76Q72 81 77 76" stroke="#83BFFC" strokeWidth="2" strokeLinecap="round"/>
                    </g></g>
                    <g className={styles["sleep-eyes"]}><path d="M47 66Q54 73 61 66M82 66Q89 73 96 66" stroke="#9EBCE3" strokeWidth="2.5" strokeLinecap="round"/><path d="M70 79H74" stroke="#6888B5" strokeWidth="2" strokeLinecap="round"/></g>
                    <path d="M59 100H84" stroke="white" strokeWidth="2.3" strokeLinecap="round" opacity=".75"/>
                  </g>
                  <g className={styles["sleep-mark"]} stroke="#84A6DA" strokeLinecap="round" strokeLinejoin="round"><path d="M106 13H113L106 21H113" strokeWidth="1.5"/><path d="M118 1H128L118 11H128" strokeWidth="1.8"/></g>
                </g>
              </svg></span>;
  return (
    <>
      <div className={styles.dock} data-awake={state.unavailable || state.awake} data-playing={state.playing}>
        {active ? (
          <button type="button" className={styles.robot} data-orbit-control
            aria-label={action} aria-pressed={!state.awake} aria-controls="home-hero-video" onClick={onToggle}>
            {graphic}
            <span className={styles.tip} aria-hidden="true">{action}</span>
          </button>
        ) : (
          <div className={styles.robot} role="img" aria-label={state.unavailable ? action : "轨道小助手"}>
            {graphic}
          </div>
        )}
        <span className={styles.name} aria-hidden="true">NV / 01</span>
      </div>
      {active && !state.touched ? (
        <span className={styles.hint} aria-hidden="true">
          {state.reduced ? "轻点小助手，切换静态表情" : state.blocked ? "轻点小助手，开启星球动画" : "轻点小助手，让星球休息"}
        </span>
      ) : null}
    </>
  );
}
