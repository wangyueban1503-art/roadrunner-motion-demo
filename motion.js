import { Euler, Group, Quaternion, Vector3 } from 'three';

const radius = .05;
const halfWidth = .009;
const halfTrack = .119;
const hipHeight = .248;
const rad = Math.PI / 180;
const xAxis = new Vector3(1, 0, 0);
const zAxis = new Vector3(0, 0, 1);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const smooth = (p) => p ** 3 * (10 - 15 * p + 6 * p ** 2);

export function makeArc(start, x, z) {
  const dx = x - start.x, dz = z - start.z;
  const chord = Math.hypot(dx, dz);
  if (chord < .004) return null;
  const forward = dx * Math.sin(start.yaw) + dz * Math.cos(start.yaw);
  const side = dx * Math.cos(start.yaw) - dz * Math.sin(start.yaw);
  const direction = forward < 0 ? -1 : 1;
  const turn = 2 * Math.atan2(direction * side, Math.abs(forward));
  const length = Math.abs(turn) < 1e-8 ? chord : chord * turn / (2 * Math.sin(turn / 2));
  const curvature = turn / length;
  const duration = Math.max(1.4, length / .28, Math.abs(turn) / .86);

  function at(fraction) {
    const yawChange = turn * fraction, halfAngle = yawChange / 2;
    const sinc = Math.abs(halfAngle) < 1e-8 ? 1 : Math.sin(halfAngle) / halfAngle;
    const distance = direction * length * fraction;
    return {
      x: start.x + distance * sinc * Math.sin(start.yaw + halfAngle),
      z: start.z + distance * sinc * Math.cos(start.yaw + halfAngle),
      yaw: start.yaw + yawChange,
      left: start.left + (distance + halfTrack * yawChange) / radius,
      right: start.right + (distance - halfTrack * yawChange) / radius,
    };
  }

  return {
    at, duration, direction,
    sample(time) {
      const p = clamp(time / duration, 0, 1);
      const travel = smooth(p);
      const speed = (length / duration) * 30 * p ** 2 * (1 - p) ** 2;
      const acceleration = (length / duration ** 2) * 60 * p * (1 - p) * (1 - 2 * p);
      const engagement = Math.sin(Math.PI * p) ** 2;
      const bank = -clamp(direction * curvature * speed ** 2 * .48, -.115, .115);
      return {
        ...at(travel),
        bodyPitch: clamp(direction * acceleration * .22, -.13, .13),
        bank,
        crouch: .011 * engagement,
        stance: engagement,
      };
    },
  };
}

export function makeModeMotion(start, x, z, mode) {
  const lateral = mode === 'lateral';
  const targetYaw = lateral ? Math.PI / 2 : 0;
  const fromYaw = start.hipYaw || 0;
  const steeringTime = Math.abs(targetYaw - fromYaw) > .001 ? 1.4 : 0;
  let travel;
  if (lateral) {
    const rightX = Math.cos(start.yaw), rightZ = -Math.sin(start.yaw);
    const distance = (x - start.x) * rightX + (z - start.z) * rightZ;
    if (Math.abs(distance) < .004 && !steeringTime) return null;
    const duration = Math.max(1.4, Math.abs(distance) / .22);
    const at = fraction => ({
      x: start.x + rightX * distance * fraction,
      z: start.z + rightZ * distance * fraction,
      yaw: start.yaw,
      left: start.left + distance * fraction / radius,
      right: start.right + distance * fraction / radius,
    });
    travel = {
      duration, direction: Math.sign(distance), at,
      sample(time) {
        const p = clamp(time / duration, 0, 1);
        const engagement = Math.sin(Math.PI * p) ** 2;
        return {...at(smooth(p)), stance: engagement, crouch: .008 * engagement};
      },
    };
  } else {
    travel = makeArc(start, x, z);
    if (!travel) return null;
  }
  return {
    duration: steeringTime + travel.duration,
    direction: travel.direction,
    at: travel.at,
    sample(time) {
      if (time < steeringTime) {
        const p = smooth(clamp(time / steeringTime, 0, 1));
        return {...start, hipYaw: fromYaw + (targetYaw - fromYaw) * p,
          bodyPitch: (start.bodyPitch || 0) * (1 - p),
          bank: (start.bank || 0) * (1 - p),
          crouch: (start.crouch || 0) * (1 - p),
          stance: (start.stance || 0) * (1 - p),
          phase: lateral ? '髋部转向横滑姿态' : '髋部回正'};
      }
      return {...travel.sample(time - steeringTime), hipYaw: targetYaw,
        lateral, phase: lateral ? '正在横向滑行' : '正在滚动'};
    },
  };
}

export function makeRig(model, ground) {
  const legs = ['L', 'R'].map((side, index) => {
    const roll = model.getObjectByName(side + '_Hip_roll');
    const hip = model.getObjectByName(side + '_Hip_pitch');
    const knee = model.getObjectByName(side + '_Knee_pitch');
    const wheel = model.getObjectByName(side + '_Wheel_spin');
    // Add a visual yaw pivot at the existing hip attachment.
    const base = roll.position.clone();
    const yaw = new Group();
    yaw.name = side + '_Hip_yaw_demo';
    yaw.position.copy(base);
    roll.parent.add(yaw);
    yaw.add(roll);
    roll.position.set(0, 0, 0);
    return {roll, hip, knee, wheel, yaw, base, side: index === 0 ? -1 : 1};
  });
  const neutralHeight = hipHeight - ground;
  const body = new Quaternion(), orientation = new Euler();
  const wheelCenter = new Vector3(), axle = new Vector3();

  function solveLeg(leg, swing, bodyY, targetZ, clearance) {
    const {roll, hip, knee, wheel} = leg;
    const rollAngle = roll.rotation.z;
    axle.copy(xAxis).applyAxisAngle(zAxis, rollAngle).applyQuaternion(body);
    const support = radius * Math.sqrt(1 - axle.y ** 2) + halfWidth * Math.abs(axle.y);
    const base = leg.base;
    const upper = knee.position, lower = wheel.position;
    function evaluate(hipAngle, kneeAngle) {
      wheelCenter.copy(lower).applyAxisAngle(xAxis, kneeAngle).add(upper)
        .applyAxisAngle(xAxis, hipAngle).add(hip.position)
        .applyAxisAngle(zAxis, rollAngle).add(base);
      wheelCenter.y -= hipHeight;
      wheelCenter.applyQuaternion(body);
      return [wheelCenter.y + bodyY - support - clearance, wheelCenter.z - targetZ];
    }

    const step = .0001;
    let a = swing, b = -.34;
    for (let i = 0; i < 11; i++) {
      const [y, z] = evaluate(a, b);
      if (Math.hypot(y, z) < .00006) break;
      const [ya, za] = evaluate(a + step, b);
      const [yb, zb] = evaluate(a, b + step);
      const A = (ya - y) / step, B = (yb - y) / step;
      const C = (za - z) / step, D = (zb - z) / step;
      const det = A * D - B * C;
      if (Math.abs(det) < 1e-8) break;
      a = clamp(a + clamp((-D * y + B * z) / det, -.24, .24), -47 * rad, 47 * rad);
      b = clamp(b + clamp((C * y - A * z) / det, -.24, .24), -51 * rad, .10);
    }
    hip.rotation.x = a;
    knee.rotation.x = b;
    return evaluate(a, b)[0];
  }

  return (posture, p) => {
    const {crouch = 0, bank = 0, bodyPitch = 0, stance = 0} = p;
    body.setFromEuler(orientation.set(bodyPitch, 0, bank, 'ZXY'));
    posture.quaternion.copy(body);
    const shift = Math.min(.018, Math.abs(bank) * .052);
    const height = neutralHeight - crouch - shift;
    posture.position.set(-.15 * bank, height, 0);

    let error = 0;
    for (const leg of legs) {
      const {side, roll, hip, knee, wheel} = leg;
      leg.yaw.rotation.y = p.hipYaw || 0;
      roll.rotation.z = p.lateral || Math.abs(p.hipYaw || 0) > .001
        ? 0 : side * .075 * stance - .64 * bank;
      if (stance < .000001) {
        hip.rotation.x = knee.rotation.x = 0;
      } else {
        // The wheel centers stay almost aligned while the torso banks into the curve.
        const targetZ = .005 + side * (-bank) * .068;
        const supportError = solveLeg(leg, -bodyPitch + .22, height, targetZ, 0);
        error = Math.max(error, Math.abs(supportError));
      }
      wheel.rotation.x = side < 0 ? p.left : p.right;
    }
    return {kneeLeft: legs[0].knee.rotation.x, kneeRight: legs[1].knee.rotation.x, bank, error};
  };
}

