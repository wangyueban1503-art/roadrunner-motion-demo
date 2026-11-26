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
  // Plan in the wheels' travel frame, which is perpendicular to the torso in side mode.
  const travelStart = {...start, yaw: start.yaw + (lateral ? Math.PI / 2 : 0)};
  const arc = makeArc(travelStart, x, z);
  if (!arc) return null;
  const end = arc.at(1);
  const turn = end.yaw - travelStart.yaw;
  const chord = Math.hypot(x - start.x, z - start.z);
  const length = Math.abs(turn) < 1e-8 ? chord : chord * turn / (2 * Math.sin(turn / 2));
  const curvature = turn / length;
  const signedCurvature = curvature * arc.direction;
  const fromLeft = start.hipYawLeft ?? start.hipYaw ?? 0;
  const fromRight = start.hipYawRight ?? start.hipYaw ?? 0;

  // In the sideways stance the two hips sit fore/aft along the travel direction.
  // Each wheel must steer along its own circular trajectory to allow body yaw.
  const steering = side => lateral
    ? Math.atan2(1, -signedCurvature * side * .082)
    : 0;
  const targetLeft = steering(-1), targetRight = steering(1);
  const steeringTime = Math.max(Math.abs(targetLeft - fromLeft), Math.abs(targetRight - fromRight)) > .001
    ? 1.4 : 0;
  const at = fraction => {
    const point = arc.at(fraction);
    const distance = arc.direction * length * fraction;
    return {
      ...point,
      yaw: point.yaw - (lateral ? Math.PI / 2 : 0),
      left: lateral
        ? start.left + distance * Math.hypot(1, signedCurvature * .082) / radius
        : point.left,
      right: lateral
        ? start.right + distance * Math.hypot(1, signedCurvature * .082) / radius
        : point.right,
    };
  };
  return {
    duration: steeringTime + arc.duration,
    direction: arc.direction,
    at,
    sample(time) {
      if (time < steeringTime) {
        const fraction = smooth(clamp(time / steeringTime, 0, 1));
        const left = fromLeft + (targetLeft - fromLeft) * fraction;
        const right = fromRight + (targetRight - fromRight) * fraction;
        return {...start, hipYaw: (left + right) / 2, hipYawLeft: left, hipYawRight: right,
          bodyPitch: (start.bodyPitch || 0) * (1 - fraction),
          bank: (start.bank || 0) * (1 - fraction),
          crouch: (start.crouch || 0) * (1 - fraction),
          stance: (start.stance || 0) * (1 - fraction),
          phase: lateral ? '双髋协调转向' : '髋部回正'};
      }
      const p = clamp((time - steeringTime) / arc.duration, 0, 1);
      const engagement = Math.sin(Math.PI * p) ** 2;
      const point = lateral
        ? {...at(smooth(p)), stance: engagement, crouch: .008 * engagement}
        : arc.sample(time - steeringTime);
      return {...point, hipYaw: (targetLeft + targetRight) / 2,
        hipYawLeft: targetLeft, hipYawRight: targetRight,
        lateral, phase: lateral ? '侧身滑行 · 双轮协调转弯' : '正在滚动'};
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
      leg.yaw.rotation.y = (side < 0 ? p.hipYawLeft : p.hipYawRight) ?? p.hipYaw ?? 0;
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

