import AWS from "aws-sdk";
import {EC2} from "aws-async-ec2";
import {Route53} from "aws-async-route53";
import {Instance} from "aws-async-ec2-instance";
import {HostedZone} from "aws-async-route53-hosted-zone";

const ami = "ami-07dc28a0d3a7e7f10";  // focal25q-r0.6
const domain = "zingle";
const key = "ubuntu";
const name = "sandbox";
const region = "us-west-2";
const sg = ["sg-6fc6961e"];           // zingle-auth
const subnet = "subnet-52c68208";     // zingle-util
const type = "t3.micro";

const wait = true;

launch({
    ami, domain, key, name, region, sg, subnet, type,
    wait
  })
  .then(console.log)
  .catch(console.error);

// TODO: Elastic IP support

async function launch({
  ami, domain, key, name, region, sg, subnet, type,
  wait
}) {
  const [ImageId, InstanceType, KeyName, SubnetId] = [ami, type, key, subnet];
  const ec2 = new EC2(AWS).selectRegion(region);
  const route53 = new Route53(AWS);
  const params = {ImageId, InstanceType, KeyName, SubnetId};

  console.info("launching instance");
  const instance = await Instance.runInstance(ec2, {
    ImageId, InstanceType, KeyName, SubnetId
  });
  console.info(instance.InstanceId, "starting");

  console.info(instance.InstanceId, "tagging Name", name);
  await instance.tag("Name", name);

  console.log(instance.InstanceId, "lookup up hosted zones");
  const privateZone = await HostedZone.findByName(route53, domain);
  const publicZone = await HostedZone.findByName(route53, "zingle.me");

  console.info(instance.InstanceId, "applying", ...sg);
  await instance.modifyGroups(sg);

  console.info(instance.InstanceId, "waiting for state: running");
  await instance.waitForRunning();
  await instance.describe();

  // set for convenient access to IPv6 address
  instance.Ipv6Address = instance.NetworkInterfaces[0]?.Ipv6Addresses?.[0]?.Ipv6Address;

  console.info(privateZone.Id, "A", `${name}.${privateZone.Name}`, instance.PrivateIpAddress);
  await privateZone.A(name, 300, instance.PrivateIpAddress);

  console.info(publicZone.Id, "A", `${name}.${publicZone.Name}`, instance.PublicIpAddress);
  await publicZone.A(name, 300, instance.PublicIpAddress);

  if (instance.Ipv6Address) {
    console.info(publicZone.Id, "AAAA", `${name}.${publicZone.Name}`, instance.Ipv6Address);
    await publicZone.AAAA(name, 300, instance.Ipv6Address);
  }

  if (wait) {
    console.info(instance.InstanceId, "waiting for state: status OK");
    await instance.waitForStatusOk();
  }
}
